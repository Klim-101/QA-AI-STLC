// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Evidence } from '@qa-ai-stlc/schemas';
import { isUrlAllowed } from '../browser-allowlist.js';
import { assertLoopbackCdpEndpoint } from '../browser-attach-endpoint.js';
import type { BlockedRequest } from '../browser-safe-mode.js';
import { SafeModeRequestTally } from '../safe-mode-requests.js';
import {
  ALL_REQUESTS_PATTERN,
  createSessionRouteHandler,
  resolveSessionSettings,
} from '../browser-session-setup.js';
import type { BrowserSession } from '../browser-session-store.js';
import { watchSessionPages } from '../browser-tabs.js';
import { loadConfig } from '../config-loader.js';
import { QaError } from '../errors.js';
import type { AuthBrowser, AuthBrowserContext, AuthPage } from '../ports/browser-launcher.js';
import { resolveBrowserEnvironment, type BrowserOpenOptions } from './browser-open.js';
import type { BrowserOperationContext } from './browser-context.js';
import { createBrowserEvidenceStore, registerBrowserAction } from './browser-evidence.js';

export interface BrowserAttachOptions extends BrowserOpenOptions {
  /** The browser's DevTools endpoint, on this machine: `http://127.0.0.1:9222` or a `ws://` URL. */
  readonly endpoint: string;
}

export interface BrowserAttachResult {
  readonly sessionId: string;
  readonly runId: string;
  readonly environment: string;
  readonly baseUrl: string;
  readonly allowlist: readonly string[];
  /** The operator's page the session drives, as it was when the session attached. */
  readonly pageUrl: string;
  /** What this session cannot see or do that an opened session can. */
  readonly notes: readonly string[];
  readonly evidence: Evidence;
}

const ATTACH_NOTES: readonly string[] = [
  'Request headers are observed only from the moment of attachment onward: reload or act in the page to make it send one.',
  'Only the page the session attached to is driven; tabs the operator or the application opens later are not part of the session.',
  'While attached, safe mode and the allowlist also apply to requests the operator makes in that page.',
  'A dialog the page raises is handled by the session dialog policy, which dismisses it unless the policy is accept.',
  'Closing the session disconnects; the operator’s browser stays open.',
];

interface AttachedPage {
  readonly context: AuthBrowserContext;
  readonly page: AuthPage;
}

// The first open page that is already on the environment allowlist, so the session never begins
// on the operator's mail or banking tab just because it was in front.
function findAllowedPage(
  browser: AuthBrowser,
  allowlist: readonly string[],
  baseUrl: string,
): AttachedPage | undefined {
  for (const context of browser.contexts()) {
    const page = context.pages().find((candidate) => isUrlAllowed(candidate.url(), allowlist, baseUrl));
    if (page !== undefined) {
      return { context, page };
    }
  }
  return undefined;
}

/**
 * MCP `qa.browser_attach` (P6-50): turns a Chrome the operator started with
 * `--remote-debugging-port` and already signed into (SSO, MFA) into a browser session the
 * `qa.browser_*` tools and a `from-browser` profile can use. The endpoint must be loopback. Safe
 * mode, the allowlist and request-header observation run on the one page the session drives, not
 * on the operator's other tabs, and closing the session disconnects without closing their browser.
 */
export async function runBrowserAttach(
  context: BrowserOperationContext,
  options: BrowserAttachOptions,
): Promise<BrowserAttachResult> {
  const endpoint = assertLoopbackCdpEndpoint(options.endpoint);
  const config = await loadConfig(context.engine);
  const environment = resolveBrowserEnvironment(config, options.environment);
  const settings = resolveSessionSettings(config, environment.config, options);

  let browser: AuthBrowser;
  try {
    browser = await context.engine.browserLauncher.connectOverCdp(endpoint, {
      timeoutMs: settings.navigationTimeoutMs,
    });
  } catch (error) {
    throw new QaError('BROWSER_ATTACH_FAILED', `Could not attach to a browser at ${endpoint}`, {
      remediation:
        'Start Chrome with --remote-debugging-port (and a dedicated --user-data-dir), sign in to the application, and check the endpoint.',
      cause: error,
    });
  }

  const blockedRequests: BlockedRequest[] = [];
  const observedRequestHeaders = new Map<string, string>();
  const requestTally = new SafeModeRequestTally();
  let session: BrowserSession;
  try {
    const target = findAllowedPage(browser, settings.allowlist, settings.baseUrl);
    if (target === undefined) {
      throw new QaError(
        'BROWSER_ATTACH_NO_PAGE',
        'None of the attached browser’s open pages is on the environment allowlist',
        { remediation: 'Open the application in a tab of that browser, then attach again.' },
      );
    }
    await target.page.route(
      ALL_REQUESTS_PATTERN,
      createSessionRouteHandler(config, environment.config, {
        allowMutations: options.executionMode === true,
        blockedRequests,
        requestTally,
        observedRequestHeaders,
      }),
    );
    session = context.sessions.open({
      browser,
      context: target.context,
      page: target.page,
      ownsBrowser: false,
      ...(options.dialogPolicy === undefined ? {} : { dialogPolicy: options.dialogPolicy }),
      ...settings,
      blockedRequests,
      requestTally,
      observedRequestHeaders,
    });
    watchSessionPages(context, session, { trackNewPages: false });
  } catch (error) {
    await browser.close();
    throw error;
  }

  const pageUrl = session.page.url();
  let evidence: Evidence;
  try {
    evidence = await registerBrowserAction({
      evidenceStore: createBrowserEvidenceStore(context.engine),
      evidenceId: context.sessions.nextEvidenceId(),
      session,
      now: context.engine.clock.now(),
      action: { type: 'attach', url: pageUrl },
    });
  } catch (error) {
    // No session may be driven without an evidence trail (ADR-005).
    await context.sessions.close(session.sessionId);
    throw error;
  }

  return {
    sessionId: session.sessionId,
    runId: session.runId,
    environment: environment.name,
    baseUrl: environment.config.baseUrl,
    allowlist: session.allowlist,
    pageUrl,
    notes: ATTACH_NOTES,
    evidence,
  };
}
