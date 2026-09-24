// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { isUrlAllowed } from './browser-allowlist.js';
import type { RouteHandler } from './ports/browser-launcher.js';

export interface BlockedRequest {
  readonly method: string;
  readonly url: string;
}

export interface SafeModeRouteHandlerOptions {
  /**
   * Lifts the GET-only restriction for an interactive case-execution session (P3-14, ADR-0009):
   * proving a real case (a login, a checkout) needs a real form submission. Off by default —
   * exploration and pick-mode sessions never set this, so their behavior is unchanged. The domain
   * allowlist check below still applies unconditionally either way; this only ever relaxes the
   * HTTP-method restriction, never the destination boundary.
   */
  readonly allowMutations?: boolean;
}

/**
 * Safe mode for an agent-driven session (AGENTS.md 12.4, ADR-005): every non-GET request is
 * aborted before it leaves the browser, so an exploratory click can never submit a form or
 * mutate the application under test (unless `options.allowMutations` opts an execution session
 * out of that one restriction, ADR-0009). Every request is also checked against the session's
 * domain allowlist here, since this handler sees every request the page makes regardless of what
 * triggered it (a typed navigation, a redirect, or a click on an in-page link) -- `qa.browser_navigate`
 * checking the allowlist on its own input is not enough to bound where a click can take the
 * session (#279). The check also covers scheme and port, not just hostname (#306): `baseUrl` is
 * the environment's configured URL, and every allowed host is expected to share its scheme and
 * effective port. `onBlocked` is called once per aborted request so a session can report what it
 * stopped.
 */
export function createBrowserSafeModeRouteHandler(
  allowlist: readonly string[],
  baseUrl: string,
  onBlocked: (request: BlockedRequest) => void,
  options: SafeModeRouteHandlerOptions = {},
): RouteHandler {
  return (route) => {
    const request = route.request();
    const method = request.method();
    const url = request.url();
    const methodAllowed = method === 'GET' || options.allowMutations === true;
    if (methodAllowed && isUrlAllowed(url, allowlist, baseUrl)) {
      return route.continue();
    }
    onBlocked({ method, url });
    return route.abort();
  };
}
