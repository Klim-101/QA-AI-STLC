// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { isUrlAllowed } from './browser-allowlist.js';
import type { RouteRequest } from './ports/browser-launcher.js';

/**
 * Remembers the latest value of the named request headers a live session's page sent to an
 * allowlisted host, in memory only, so a `from-browser` profile can replay the header the way an
 * operator would copy it from developer tools (ADR-0012). A request to a host off the allowlist is
 * never recorded: its headers are not the application's credentials.
 *
 * `allHeaders` is what Playwright exposes for the complete header set, including the security
 * related ones a plain `headers()` omits; a request object without it (a test double) is skipped.
 */
export async function observeRequestHeaders(
  request: RouteRequest,
  headerNames: ReadonlySet<string>,
  scope: { readonly allowlist: readonly string[]; readonly baseUrl: string },
  observed: Map<string, string>,
): Promise<void> {
  if (
    headerNames.size === 0 ||
    request.allHeaders === undefined ||
    !isUrlAllowed(request.url(), scope.allowlist, scope.baseUrl)
  ) {
    return;
  }
  for (const [name, value] of Object.entries(await request.allHeaders())) {
    const lowerCaseName = name.toLowerCase();
    if (headerNames.has(lowerCaseName)) {
      observed.set(lowerCaseName, value);
    }
  }
}
