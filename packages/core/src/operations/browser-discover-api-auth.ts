// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { ApiAuthProfile, BrowserTokenSource } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { isUrlAllowed } from '../browser-allowlist.js';
import type { BrowserSession } from '../browser-session-store.js';
import { isCookieDomainAllowed } from '../browser-token-source.js';
import { QaError } from '../errors.js';
import type { BrowserOperationContext } from './browser-context.js';

export interface DiscoverApiAuthOptions {
  readonly sessionId: string;
}

export interface DiscoverApiAuthResult {
  readonly sessionId: string;
  /** The request header the application sends its token in; a name only. */
  readonly tokenHeader: string;
  /** Where the same token is stored in the session, most robust first, then the request header itself. */
  readonly sources: readonly BrowserTokenSource[];
  /** The `from-browser` profile built from the first source, ready for `qa.config_add_api_auth`. */
  readonly proposedProfile: ApiAuthProfile;
}

const StoredEntriesSchema = z.array(z.tuple([z.string(), z.string()]));
const BEARER_PREFIX = /^Bearer\s+/iu;
const MAX_JSON_DEPTH = 5;
const MAX_NAME_LENGTH = 200;

// A cookie name, storage key or JSON path comes from the page. One that is long or holds control
// characters is not reported, so the page cannot use the result to carry text to the agent (12.4).
function isReportableName(name: string): boolean {
  return name.length <= MAX_NAME_LENGTH && !/\p{Cc}/u.test(name);
}

/** Finds the dot-separated path to a string equal to `token` inside parsed JSON, or `undefined`. */
function findJsonPath(value: unknown, token: string, depth: number): string | undefined {
  if (value === token) {
    return '';
  }
  if (depth >= MAX_JSON_DEPTH || value === null || typeof value !== 'object') {
    return undefined;
  }
  for (const [key, child] of Object.entries(value)) {
    const found = findJsonPath(child, token, depth + 1);
    if (found !== undefined) {
      return found === '' ? key : `${key}.${found}`;
    }
  }
  return undefined;
}

/** Where `token` sits in one stored value: the whole value (`''`), a path into its JSON, or nowhere. */
function locateToken(stored: string, token: string): string | undefined {
  if (stored.replace(BEARER_PREFIX, '') === token) {
    return '';
  }
  try {
    return findJsonPath(JSON.parse(stored), token, 0);
  } catch {
    return undefined;
  }
}

function jsonPathField(path: string): { readonly jsonPath?: string } {
  return path === '' ? {} : { jsonPath: path };
}

// Runs inside the browser, so Node-side coverage never sees it (the same gap `readSessionStorageItem`
// in browser-token-source.ts documents).
/* v8 ignore next 11 */
function readAllSessionStorage(): [string, string][] {
  const { sessionStorage } = globalThis as unknown as {
    sessionStorage: {
      length: number;
      key(index: number): string | null;
      getItem(key: string): string | null;
    };
  };
  const keys = Array.from({ length: sessionStorage.length }, (_unused, index) => sessionStorage.key(index));
  return keys.flatMap((key) =>
    key === null ? [] : [[key, sessionStorage.getItem(key) ?? ''] as [string, string]],
  );
}

async function findStoredSources(session: BrowserSession, token: string): Promise<BrowserTokenSource[]> {
  const sources: BrowserTokenSource[] = [];
  const { cookies, origins } = await session.context.storageState();
  for (const cookie of cookies) {
    if (
      isReportableName(cookie.name) &&
      isCookieDomainAllowed(cookie.domain, session.allowlist) &&
      locateToken(cookie.value, token) === ''
    ) {
      sources.push({ kind: 'cookie', name: cookie.name, sendAs: 'bearer' });
    }
  }
  for (const entry of origins) {
    if (!isUrlAllowed(entry.origin, session.allowlist, session.baseUrl)) {
      continue;
    }
    for (const item of entry.localStorage) {
      const path = locateToken(item.value, token);
      if (path !== undefined && isReportableName(item.name) && isReportableName(path)) {
        sources.push({ kind: 'local-storage', key: item.name, ...jsonPathField(path) });
      }
    }
  }
  // The page is untrusted until it is on the allowlist; its storage would otherwise be foreign data.
  if (isUrlAllowed(session.page.url(), session.allowlist, session.baseUrl)) {
    // An answer the page shaped differently is read as an empty storage, not trusted.
    const stored = StoredEntriesSchema.safeParse(await session.page.evaluate(readAllSessionStorage));
    for (const [key, value] of stored.success ? stored.data : []) {
      const path = locateToken(value, token);
      if (path !== undefined && isReportableName(key) && isReportableName(path)) {
        sources.push({ kind: 'session-storage', key, ...jsonPathField(path) });
      }
    }
  }
  return sources;
}

/** The observed header that carries the application's token: `Authorization` first, else a bearer one. */
function pickTokenHeader(session: BrowserSession): { name: string; value: string } | undefined {
  const authorization = session.observedRequestHeaders.get('authorization');
  if (authorization !== undefined && BEARER_PREFIX.test(authorization)) {
    return { name: 'authorization', value: authorization };
  }
  for (const [name, value] of session.observedRequestHeaders) {
    if (BEARER_PREFIX.test(value)) {
      return { name, value };
    }
  }
  return undefined;
}

/**
 * MCP `qa.browser_discover_api_auth` (P6-93): after sign-in, finds where the application keeps the
 * bearer token its own API calls send, and proposes a `from-browser` profile. The token is taken
 * from the request headers the session observed, then looked up in the session's cookies,
 * localStorage and sessionStorage. The result holds names only (a header, a cookie, a storage key,
 * a path into a stored JSON value); a token value is never returned or logged.
 */
export async function runBrowserDiscoverApiAuth(
  context: BrowserOperationContext,
  options: DiscoverApiAuthOptions,
): Promise<DiscoverApiAuthResult> {
  const session = await context.sessions.get(options.sessionId);
  const header = pickTokenHeader(session);
  if (header === undefined) {
    const sendsOtherScheme = session.observedRequestHeaders.has('authorization');
    throw new QaError(
      'API_AUTH_DISCOVERY_NO_TOKEN',
      sendsOtherScheme
        ? 'The application sends an Authorization header that is not a bearer token.'
        : 'No request carrying a bearer token was observed in this session.',
      {
        remediation: sendsOtherScheme
          ? 'Use a basic or api-key profile whose secrets are QA_ variables (qa.config_add_api_auth).'
          : 'Sign in, open a page that calls the application API, then run discovery again. Requests are observed only while the session is open.',
      },
    );
  }

  // A stored token is always sent as `Authorization: Bearer`, so it only stands in for that header.
  const storedSources =
    header.name === 'authorization'
      ? await findStoredSources(session, header.value.replace(BEARER_PREFIX, ''))
      : [];
  const requestHeaderSource: BrowserTokenSource = { kind: 'request-header', header: header.name };
  const proposed = storedSources[0] ?? requestHeaderSource;
  return {
    sessionId: options.sessionId,
    tokenHeader: header.name,
    sources: [...storedSources, requestHeaderSource],
    proposedProfile: { type: 'from-browser', source: proposed },
  };
}
