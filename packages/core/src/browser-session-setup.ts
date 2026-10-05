// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Config, EnvironmentConfig, UiComponentLibrary } from '@qa-ai-stlc/schemas';
import { collectObservedRequestHeaderNames } from './api-auth.js';
import { observeRequestHeaders } from './browser-request-observer.js';
import { createBrowserSafeModeRouteHandler, type BlockedRequest } from './browser-safe-mode.js';
import type { OpenBrowserSessionOptions, WidgetTarget } from './browser-session-store.js';
import { resolveBrowserTimeouts } from './browser-timeouts.js';
import type { RouteHandler } from './ports/browser-launcher.js';

/** Matches every request the page makes, so safe mode sees all of them (not only the document). */
export const ALL_REQUESTS_PATTERN = '**/*';

/** What the host supplies about the configured component library; core cannot see the explorer's profiles. */
export interface ComponentLibraryResolvers {
  /** Busy selectors the library declares (P6-42). */
  readonly resolveLibraryBusySelectors?: (library: UiComponentLibrary) => readonly string[];
  /** The widgets the library renders, for the widget actions (P6-43). */
  readonly resolveLibraryWidgets?: (library: UiComponentLibrary) => readonly WidgetTarget[];
}

export interface SessionRouteHandlerOptions {
  /** ADR-0009: lets a non-GET request through; the allowlist still applies. */
  readonly allowMutations: boolean;
  readonly blockedRequests: BlockedRequest[];
  readonly observedRequestHeaders: Map<string, string>;
}

/**
 * The one handler every request of a session meets: it records the request headers a
 * `from-browser` profile replays, then applies safe mode and the domain allowlist (AGENTS.md 12.4).
 * Opened and attached sessions share it so they cannot drift apart.
 */
export function createSessionRouteHandler(
  config: Config,
  environment: EnvironmentConfig,
  options: SessionRouteHandlerOptions,
): RouteHandler {
  const observedHeaderNames = collectObservedRequestHeaderNames(config.apiAuth);
  const safeModeHandler = createBrowserSafeModeRouteHandler(
    environment.allowlist,
    environment.baseUrl,
    (request) => options.blockedRequests.push(request),
    { allowMutations: options.allowMutations },
  );
  return async (route) => {
    await observeRequestHeaders(
      route.request(),
      observedHeaderNames,
      environment,
      options.observedRequestHeaders,
    );
    await safeModeHandler(route);
  };
}

/** The environment-derived settings every browser session carries, fixed for the session's life. */
export function resolveSessionSettings(
  config: Config,
  environment: EnvironmentConfig,
  resolvers: ComponentLibraryResolvers,
): Pick<
  OpenBrowserSessionOptions,
  'allowlist' | 'baseUrl' | 'navigationTimeoutMs' | 'actionTimeoutMs' | 'busySelectors' | 'widgetTargets'
> {
  const timeouts = resolveBrowserTimeouts(environment);
  return {
    allowlist: environment.allowlist,
    baseUrl: environment.baseUrl,
    navigationTimeoutMs: timeouts.navigationTimeoutMs,
    actionTimeoutMs: timeouts.actionTimeoutMs,
    busySelectors: [
      ...new Set([
        ...(resolvers.resolveLibraryBusySelectors?.(config.ui.componentLibrary) ?? []),
        ...config.ui.busySelectors,
      ]),
    ],
    widgetTargets: resolvers.resolveLibraryWidgets?.(config.ui.componentLibrary) ?? [],
  };
}
