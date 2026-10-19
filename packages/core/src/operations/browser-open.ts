// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Config, EnvironmentConfig, Evidence } from '@qa-ai-stlc/schemas';
import type { BlockedRequest } from '../browser-safe-mode.js';
import { authenticate, withDefaultLoginSelectors } from '../auth.js';
import { SafeModeRequestTally } from '../safe-mode-requests.js';
import {
  ALL_REQUESTS_PATTERN,
  createSessionRouteHandler,
  resolveSessionSettings,
  type ComponentLibraryResolvers,
} from '../browser-session-setup.js';
import type { AuthBrowser, StorageState } from '../ports/browser-launcher.js';
import type { BrowserSession, DialogPolicy } from '../browser-session-store.js';
import { watchSessionPages } from '../browser-tabs.js';
import { loadConfig } from '../config-loader.js';
import { QaError } from '../errors.js';
import type { BrowserOperationContext } from './browser-context.js';
import { createBrowserEvidenceStore, registerBrowserAction } from './browser-evidence.js';

export interface BrowserOpenOptions extends ComponentLibraryResolvers {
  /** Environment name from config.yaml. Required only when the project defines more than one. */
  readonly environment?: string;
  /**
   * Opts into interactive case execution's one relaxation of safe mode (P3-14, ADR-0009): the
   * session's route handler allows non-GET requests, so a real form submission can go through.
   * The domain allowlist still applies unconditionally. Off by default — exploration and pick
   * mode never set this.
   */
  readonly executionMode?: boolean;
  /**
   * What the session does with an `alert`, `confirm` or `prompt` (P6-59): `dismiss` (the default)
   * or `accept`. Either way each dialog is recorded as evidence. Accepting only lets the page
   * carry on; safe mode still aborts any non-GET request that follows.
   */
  readonly dialogPolicy?: DialogPolicy;
  /**
   * Opens a visible browser window instead of a headless one (P6-105). Falls back to the
   * environment's `headed` setting, then to headless. Safe mode, the allowlist and evidence
   * registration are the same either way.
   */
  readonly headed?: boolean;
  /**
   * Identity name from config.yaml (P6-74). The session signs in through the same `authenticate`
   * flow crawling uses and starts with the resulting storage state, so a protected page opens
   * authenticated. The state itself is never returned or registered.
   */
  readonly identity?: string;
  /** Required, and only used, when the identity uses `cdp-attach`. */
  readonly cdpEndpointUrl?: string;
}

export interface BrowserOpenResult {
  readonly sessionId: string;
  readonly runId: string;
  readonly environment: string;
  readonly baseUrl: string;
  readonly allowlist: readonly string[];
  /** Whether the session runs in a visible window; false means headless. */
  readonly headed: boolean;
  /** The identity the session signed in as; absent for an anonymous session. */
  readonly identity?: string;
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

// Playwright words a missing display differently per platform and version; these fragments are the
// ones it has used for "a headed browser cannot start here".
const NO_DISPLAY_PATTERN = /X server|\$DISPLAY|headed browser|XServer|no display/i;

async function launchSessionBrowser(context: BrowserOperationContext, headed: boolean): Promise<AuthBrowser> {
  if (!headed) {
    return context.engine.browserLauncher.launch();
  }
  try {
    return await context.engine.browserLauncher.launch({ headless: false });
  } catch (error) {
    if (error instanceof Error && NO_DISPLAY_PATTERN.test(error.message)) {
      throw new QaError(
        'BROWSER_HEADED_UNAVAILABLE',
        'A visible browser window cannot be opened on this machine: no display is available.',
        {
          remediation:
            'Run from a desktop session, or open the session without "headed" (and unset "headed" on the environment in config.yaml).',
          cause: error,
        },
      );
    }
    throw error;
  }
}

async function signIn(
  context: BrowserOperationContext,
  config: Config,
  environment: EnvironmentConfig,
  options: BrowserOpenOptions,
): Promise<StorageState | undefined> {
  if (options.identity === undefined) {
    return undefined;
  }
  const identityConfig = config.identities[options.identity];
  if (identityConfig === undefined) {
    throw new QaError('BROWSER_IDENTITY_UNKNOWN', `No identity named "${options.identity}" in config.yaml`, {
      remediation: `Use one of: ${Object.keys(config.identities).join(', ')}.`,
    });
  }
  return authenticate(
    context.engine.browserLauncher,
    withDefaultLoginSelectors(identityConfig, config),
    context.engine.env,
    {
      ...(options.cdpEndpointUrl === undefined ? {} : { cdpEndpointUrl: options.cdpEndpointUrl }),
      ...(environment.tlsInsecure === true ? { tlsInsecure: true } : {}),
    },
  );
}

/**
 * MCP `qa.browser_open` (P2-06): launches a browser (headless unless asked for a visible window) for an exploratory session and
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
  const config = await loadConfig(context.engine);
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

  const headed = options.headed ?? environment.config.headed ?? false;
  const browser = await launchSessionBrowser(context, headed);
  const storageState = await signIn(context, config, environment.config, options);
  const blockedRequests: BlockedRequest[] = [];
  const observedRequestHeaders = new Map<string, string>();
  const requestTally = new SafeModeRequestTally();
  let session: BrowserSession;
  try {
    const browserContext = await browser.newContext({
      ...(storageState === undefined ? {} : { storageState }),
      ...(environment.config.tlsInsecure === true ? { ignoreHttpsErrors: true } : {}),
    });
    const page = await browserContext.newPage();
    // On the context, not the page: a popup's first request happens before any handler could be
    // attached to the new page, and it must meet safe mode and the allowlist like every other one.
    await browserContext.route(
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
      context: browserContext,
      page,
      ...(options.dialogPolicy === undefined ? {} : { dialogPolicy: options.dialogPolicy }),
      ...resolveSessionSettings(config, environment.config, options),
      environmentName: environment.name,
      blockedRequests,
      requestTally,
      observedRequestHeaders,
    });
    watchSessionPages(context, session);
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
    headed,
    ...(options.identity === undefined ? {} : { identity: options.identity }),
    evidence,
  };
}
