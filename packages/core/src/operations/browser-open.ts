// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Config, EnvironmentConfig, Evidence } from '@qa-ai-stlc/schemas';
import type { BlockedRequest } from '../browser-safe-mode.js';
import { createBrowserSafeModeRouteHandler } from '../browser-safe-mode.js';
import type { BrowserSession } from '../browser-session-store.js';
import { loadConfig } from '../config-loader.js';
import { QaError } from '../errors.js';
import { QaStore } from '../qa-store.js';
import type { BrowserOperationContext } from './browser-context.js';
import { createBrowserEvidenceStore, registerBrowserAction } from './browser-evidence.js';

/** Matches every request the page makes, so safe mode sees all of them (not only the document). */
const ALL_REQUESTS_PATTERN = '**/*';

export interface BrowserOpenOptions {
  /** Environment name from config.yaml. Required only when the project defines more than one. */
  readonly environment?: string;
  /**
   * Opts into interactive case execution's one relaxation of safe mode (P3-14, ADR-0009): the
   * session's route handler allows non-GET requests, so a real form submission can go through.
   * The domain allowlist still applies unconditionally. Off by default — exploration and pick
   * mode never set this.
   */
  readonly executionMode?: boolean;
}

export interface BrowserOpenResult {
  readonly sessionId: string;
  readonly runId: string;
  readonly environment: string;
  readonly baseUrl: string;
  readonly allowlist: readonly string[];
  readonly evidence: Evidence;
}

export function resolveBrowserEnvironment(
  config: Config,
  name: string | undefined,
): { readonly name: string; readonly config: EnvironmentConfig } {
  const names = Object.keys(config.environments);
  if (name !== undefined) {
    const environment = config.environments[name];
    if (environment === undefined) {
      throw new QaError('BROWSER_ENVIRONMENT_UNKNOWN', `No environment named "${name}" in config.yaml`, {
        remediation: `Use one of: ${names.join(', ')}.`,
      });
    }
    return { name, config: environment };
  }
  const [onlyEntry] = Object.entries(config.environments);
  if (names.length === 1 && onlyEntry !== undefined) {
    const [onlyName, onlyEnvironment] = onlyEntry;
    return { name: onlyName, config: onlyEnvironment };
  }
  throw new QaError(
    'BROWSER_ENVIRONMENT_AMBIGUOUS',
    names.length === 0
      ? 'config.yaml defines no environments'
      : 'No environment given and config.yaml defines more than one',
    {
      remediation:
        names.length === 0
          ? 'Add an environment to config.yaml.'
          : `Pass an environment, one of: ${names.join(', ')}.`,
    },
  );
}

/**
 * MCP `qa.browser_open` (P2-06): launches a headless browser for an exploratory session and
 * records opening it as evidence. Safe mode is applied here, once, for the whole session
 * (AGENTS.md 12.4): every non-GET request is aborted, so a later click can never submit a form —
 * unless `options.executionMode` opts an interactive case-execution session out of that one
 * restriction (P3-14, ADR-0009). The session's domain allowlist comes from the environment's own
 * configuration and bounds every navigation the session will be allowed to make, in either mode.
 */
export async function runBrowserOpen(
  context: BrowserOperationContext,
  options: BrowserOpenOptions = {},
): Promise<BrowserOpenResult> {
  const store = new QaStore({ projectRoot: context.engine.projectRoot, fs: context.engine.fs });
  const config = await loadConfig(store);
  const environment = resolveBrowserEnvironment(config, options.environment);
  const evidenceStore = createBrowserEvidenceStore(context.engine);

  if (environment.config.tlsInsecure === true) {
    context.engine.logger.warn(
      `TLS certificate validation is disabled for environment "${environment.name}"`,
      {
        code: 'ENVIRONMENT_TLS_INSECURE',
        environment: environment.name,
      },
    );
  }

  const browser = await context.engine.browserLauncher.launch();
  const blockedRequests: BlockedRequest[] = [];
  let session: BrowserSession;
  try {
    const browserContext = await browser.newContext(
      environment.config.tlsInsecure === true ? { ignoreHttpsErrors: true } : {},
    );
    const page = await browserContext.newPage();
    await page.route(
      ALL_REQUESTS_PATTERN,
      createBrowserSafeModeRouteHandler(
        environment.config.allowlist,
        environment.config.baseUrl,
        (request) => blockedRequests.push(request),
        { allowMutations: options.executionMode === true },
      ),
    );
    session = context.sessions.open({
      browser,
      context: browserContext,
      page,
      allowlist: environment.config.allowlist,
      baseUrl: environment.config.baseUrl,
      blockedRequests,
    });
  } catch (error) {
    await browser.close();
    throw error;
  }

  let evidence: Evidence;
  try {
    evidence = await registerBrowserAction({
      evidenceStore,
      evidenceId: context.sessions.nextEvidenceId(),
      session,
      now: context.engine.clock.now(),
      action: { type: 'open', url: environment.config.baseUrl },
    });
  } catch (error) {
    // A session whose own opening could not be registered would be a browser an agent drives
    // without an evidence trail, which ADR-005 does not allow to exist at all.
    await context.sessions.close(session.sessionId);
    throw error;
  }

  return {
    sessionId: session.sessionId,
    runId: session.runId,
    environment: environment.name,
    baseUrl: environment.config.baseUrl,
    allowlist: session.allowlist,
    evidence,
  };
}
