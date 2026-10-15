// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Config } from '@qa-ai-stlc/schemas';
import { collectObservedRequestHeaderNames } from './api-auth.js';
import { createBrowserSafeModeRouteHandler } from './browser-safe-mode.js';
import { observeRequestHeaders } from './browser-request-observer.js';
import { resolveBrowserTimeouts } from './browser-timeouts.js';
import { createPageOrigin, type BrowserTokenOrigin } from './browser-token-source.js';
import type { EngineContext } from './engine-context.js';
import { QaError } from './errors.js';
import { resolveBrowserEnvironment } from './operations/browser-open.js';
import { signInForRun } from './run-sign-in.js';

/**
 * Opens a headless session signed in as `identityName`, loads the environment's base URL, and hands
 * `use` a token origin read from it, so a run can resolve a `from-browser` `apiAuth` profile with
 * nobody at a keyboard (ADR-0012). The session sits under safe mode with the environment's
 * allowlist and is closed when `use` returns or throws; whatever it read stays in memory.
 *
 * A request-header or sessionStorage source can only be read from a page that really loaded, which
 * is why this opens a page instead of reading a saved storage state. Only GET requests are let
 * through: loading the application must not write anything.
 */
export async function withRunTokenOrigin<TResult>(
  engine: EngineContext,
  config: Config,
  options: {
    readonly environment: string | undefined;
    readonly identity: string | undefined;
    readonly profileName: string;
  },
  use: (origin: BrowserTokenOrigin) => Promise<TResult>,
): Promise<TResult> {
  if (options.identity === undefined) {
    throw new QaError(
      'API_AUTH_SESSION_REQUIRED',
      `Profile "${options.profileName}" reads its token from a browser session, and the run has no identity to sign in as`,
      {
        remediation:
          'Pass an identity (--identity, or the identity argument of the tool), or set "identity" on the environment in config.yaml, so the run can sign in and read the token.',
      },
    );
  }

  const environment = resolveBrowserEnvironment(config, options.environment);
  const storageState = await signInForRun(engine, options.identity, options.environment);
  const { navigationTimeoutMs } = resolveBrowserTimeouts(environment.config);
  const observedRequestHeaders = new Map<string, string>();
  const observedHeaderNames = collectObservedRequestHeaderNames(config.apiAuth);
  const safeModeHandler = createBrowserSafeModeRouteHandler(
    environment.config.allowlist,
    environment.config.baseUrl,
    () => undefined,
    {
      allowMutations: false,
      ...(environment.config.safeNonGetRequests === undefined
        ? {}
        : { safeRequests: environment.config.safeNonGetRequests }),
    },
  );

  const browser = await engine.browserLauncher.launch();
  try {
    const context = await browser.newContext({
      storageState,
      ...(environment.config.tlsInsecure === true ? { ignoreHttpsErrors: true } : {}),
    });
    await context.route('**/*', async (route) => {
      await observeRequestHeaders(
        route.request(),
        observedHeaderNames,
        environment.config,
        observedRequestHeaders,
      );
      await safeModeHandler(route);
    });
    const page = await context.newPage();
    await page.goto(environment.config.baseUrl, { timeout: navigationTimeoutMs });
    await page.waitForLoadState('networkidle');
    return await use(
      createPageOrigin(
        {
          context,
          page,
          allowlist: environment.config.allowlist,
          baseUrl: environment.config.baseUrl,
          observedRequestHeaders,
        },
        `a headless session signed in as "${options.identity}"`,
      ),
    );
  } finally {
    await browser.close();
  }
}
