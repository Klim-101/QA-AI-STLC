// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { isUrlAllowed } from './browser-allowlist.js';
import type { RouteRequest } from './ports/browser-launcher.js';

const BEARER_VALUE = /^Bearer\s+\S/iu;

/**
 * Remembers the latest value of the named request headers a live session's page sent to an
 * allowlisted host, in memory only, so a `from-browser` profile can replay the header the way an
 * operator would copy it from developer tools (ADR-0012). A request to a host off the allowlist is
 * never recorded: its headers are not the application's credentials.
 *
 * Besides the named headers, `Authorization` and any header carrying a `Bearer` value are kept, so
 * discovery (P6-93) can tell which header the application authenticates with before any profile
 * names it. Values stay in memory and are never returned by a tool.
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
  if (request.allHeaders === undefined || !isUrlAllowed(request.url(), scope.allowlist, scope.baseUrl)) {
    return;
  }
  for (const [name, value] of Object.entries(await request.allHeaders())) {
    const lowerCaseName = name.toLowerCase();
    if (headerNames.has(lowerCaseName) || lowerCaseName === 'authorization' || BEARER_VALUE.test(value)) {
      observed.set(lowerCaseName, value);
    }
  }
}
