// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { SafeNonGetRequest } from '@qa-ai-stlc/schemas';
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
  /**
   * The non-GET requests the environment names (`safeNonGetRequests`, ADR-0014): a POST to an exact
   * path on an allowlisted host goes through, every other non-GET request is still aborted. This is
   * the one place safe mode reads the list, so every session that applies safe mode honours it the
   * same way.
   */
  readonly safeRequests?: readonly SafeNonGetRequest[];
  /** Called once for each request let through only because of `safeRequests`. */
  readonly onAllowed?: (request: BlockedRequest) => void;
}

function isNamedSafeRequest(
  method: string,
  url: string,
  safeRequests: readonly SafeNonGetRequest[] | undefined,
): boolean {
  if (safeRequests === undefined || safeRequests.length === 0) {
    return false;
  }
  const { pathname } = new URL(url);
  return safeRequests.some((entry) => entry.method === method && entry.path === pathname);
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
    const isAllowedHost = isUrlAllowed(url, allowlist, baseUrl);
    if (methodAllowed && isAllowedHost) {
      return route.continue();
    }
    // The host check comes first: an entry never widens where a session can go. `isUrlAllowed`
    // has parsed the URL by now, so reading its path cannot throw.
    if (isAllowedHost && isNamedSafeRequest(method, url, options.safeRequests)) {
      options.onAllowed?.({ method, url });
      return route.continue();
    }
    onBlocked({ method, url });
    return route.abort();
  };
}
