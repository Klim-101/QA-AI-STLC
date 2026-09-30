// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { BrowserTokenSource } from '@qa-ai-stlc/schemas';
import { isUrlAllowed } from './browser-allowlist.js';
import type { BrowserSession } from './browser-session-store.js';
import { QaError } from './errors.js';
import type { StorageState } from './ports/browser-launcher.js';

/**
 * Where a `from-browser` profile can read from. A live session offers everything a developer-tools
 * inspection would; a saved storage state offers only what Playwright persists (cookies and
 * `localStorage`), so the other two sources are absent and fail with a coded error (ADR-0012).
 */
export interface BrowserTokenOrigin {
  readonly description: string;
  readonly allowlist: readonly string[];
  readonly baseUrl: string;
  readonly loadStorageState: () => Promise<StorageState>;
  readonly readSessionStorage?: (key: string) => Promise<string | undefined>;
  readonly readObservedRequestHeader?: (name: string) => string | undefined;
}

/** The credential a profile sends: a header name and its full value, plus every secret in it. */
export interface BrowserToken {
  readonly headerName: string;
  readonly headerValue: string;
  readonly secretValues: readonly string[];
}

const BEARER_PREFIX = /^Bearer\s+/iu;

/** A saved storage state (a file the operator authenticated into earlier). */
export function createStorageStateOrigin(
  storageState: StorageState,
  scope: { readonly allowlist: readonly string[]; readonly baseUrl: string },
): BrowserTokenOrigin {
  return {
    description: 'the saved storage state',
    ...scope,
    loadStorageState: () => Promise.resolve(storageState),
  };
}

/** A live engine browser session, with sessionStorage and observed request headers on top. */
export function createSessionOrigin(session: BrowserSession): BrowserTokenOrigin {
  return {
    description: 'the open browser session',
    allowlist: session.allowlist,
    baseUrl: session.baseUrl,
    loadStorageState: () => session.context.storageState(),
    readSessionStorage: async (key) => {
      // The page is untrusted until proven to be on the allowlist: reading its storage while it
      // sits on some other origin would hand back a value the application never set.
      if (!isUrlAllowed(session.page.url(), session.allowlist, session.baseUrl)) {
        throw new QaError(
          'API_AUTH_SOURCE_UNAVAILABLE',
          'The session page is not on the environment allowlist, so its sessionStorage is not read',
          { remediation: 'Navigate the session back to the application, then retry.' },
        );
      }
      const value = await session.page.evaluate(readSessionStorageItem, key);
      return typeof value === 'string' ? value : undefined;
    },
    readObservedRequestHeader: (name) => session.observedRequestHeaders.get(name.toLowerCase()),
  };
}

// Runs inside the browser, where a closure over Node-side state is not available, and is not
// instrumented by Node-side coverage (the same gap `browser-accessibility-scan.ts` documents).
/* v8 ignore next 4 */
function readSessionStorageItem(key: string): string | null {
  const { sessionStorage } = globalThis as unknown as {
    sessionStorage: { getItem(key: string): string | null };
  };
  return sessionStorage.getItem(key);
}

function unavailable(what: string, origin: BrowserTokenOrigin): QaError {
  return new QaError('API_AUTH_SOURCE_UNAVAILABLE', `${what} was not found in ${origin.description}`, {
    remediation:
      'Sign in to the application in that session first, and check the source in the apiAuth profile.',
  });
}

function unsupported(what: string, origin: BrowserTokenOrigin): QaError {
  return new QaError('API_AUTH_SOURCE_UNSUPPORTED', `${what} cannot be read from ${origin.description}`, {
    remediation:
      'Pass the id of an open browser session instead, or use a cookie or localStorage source: a saved storage state holds only those.',
  });
}

function invalid(what: string): QaError {
  return new QaError('API_AUTH_SOURCE_INVALID', `${what} does not hold a usable token`, {
    remediation: 'Check the jsonPath in the apiAuth profile against the stored value.',
  });
}

// Reads `path` (dot-separated object keys or array indexes) out of a JSON document.
function readJsonPath(raw: string, path: string, what: string): string {
  let current: unknown;
  try {
    current = JSON.parse(raw);
  } catch {
    throw invalid(what);
  }
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') {
      throw invalid(what);
    }
    current = (current as Record<string, unknown>)[segment];
  }
  if (typeof current === 'string' && current.length > 0) {
    return current;
  }
  if (typeof current === 'number' && Number.isFinite(current)) {
    return String(current);
  }
  throw invalid(what);
}

function toToken(raw: string, jsonPath: string | undefined, what: string): BrowserToken {
  const extracted = jsonPath === undefined ? raw : readJsonPath(raw, jsonPath, what);
  const token = extracted.replace(BEARER_PREFIX, '');
  if (token.length === 0) {
    throw invalid(what);
  }
  return { headerName: 'Authorization', headerValue: `Bearer ${token}`, secretValues: [token] };
}

// A cookie set for a parent domain is sent to an allowlisted subdomain, so it counts.
function isCookieDomainAllowed(domain: string, allowlist: readonly string[]): boolean {
  const bare = domain.replace(/^\./u, '');
  return allowlist.some((host) => host === bare || host.endsWith(`.${bare}`));
}

async function readCookie(name: string, origin: BrowserTokenOrigin): Promise<string | undefined> {
  const { cookies } = await origin.loadStorageState();
  return cookies.find(
    (cookie) => cookie.name === name && isCookieDomainAllowed(cookie.domain, origin.allowlist),
  )?.value;
}

async function readLocalStorage(key: string, origin: BrowserTokenOrigin): Promise<string | undefined> {
  const { origins } = await origin.loadStorageState();
  for (const entry of origins) {
    if (!isUrlAllowed(entry.origin, origin.allowlist, origin.baseUrl)) {
      continue;
    }
    const item = entry.localStorage.find((candidate) => candidate.name === key);
    if (item !== undefined) {
      return item.value;
    }
  }
  return undefined;
}

/**
 * Reads the token a `from-browser` profile names, where an operator would find it in developer
 * tools. Only allowlisted origins are read. Every failure is a coded error that names the source
 * and never a value (ADR-0012). A `request-header` source is replayed as the same header with its
 * observed value; every other source becomes a bearer token.
 */
export async function readBrowserToken(
  source: BrowserTokenSource,
  origin: BrowserTokenOrigin,
): Promise<BrowserToken> {
  switch (source.kind) {
    case 'cookie': {
      const what = `The cookie "${source.name}"`;
      const value = await readCookie(source.name, origin);
      if (value === undefined) {
        throw unavailable(what, origin);
      }
      return toToken(value, undefined, what);
    }
    case 'local-storage': {
      const what = `The localStorage key "${source.key}"`;
      const value = await readLocalStorage(source.key, origin);
      if (value === undefined) {
        throw unavailable(what, origin);
      }
      return toToken(value, source.jsonPath, what);
    }
    case 'session-storage': {
      const what = `The sessionStorage key "${source.key}"`;
      if (origin.readSessionStorage === undefined) {
        throw unsupported(what, origin);
      }
      const value = await origin.readSessionStorage(source.key);
      if (value === undefined) {
        throw unavailable(what, origin);
      }
      return toToken(value, source.jsonPath, what);
    }
    case 'request-header': {
      const what = `A "${source.header}" request header`;
      if (origin.readObservedRequestHeader === undefined) {
        throw unsupported(what, origin);
      }
      const value = origin.readObservedRequestHeader(source.header);
      if (value === undefined || value.length === 0) {
        throw unavailable(what, origin);
      }
      return {
        headerName: source.header,
        headerValue: value,
        secretValues: [value, value.replace(BEARER_PREFIX, '')],
      };
    }
    default:
      return assertNever(source);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled browser token source: ${JSON.stringify(value)}`);
}
