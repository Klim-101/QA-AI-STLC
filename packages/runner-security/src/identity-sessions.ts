// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  AuthSessionStore,
  QaError,
  QaStore,
  authenticate,
  isUrlAllowed,
  loadConfig,
  type EngineContext,
  type StorageState,
} from '@qa-ai-stlc/core';
import type { IdentityConfig, SecurityAuthorization } from '@qa-ai-stlc/schemas';
import type { CookieFlags } from './cookie-flags.js';

type Role = SecurityAuthorization['identities'][number]['role'];
type StoredCookie = StorageState['cookies'][number];

/** One identity's signed-in browser session, reduced to what the audit's HTTP requests need. */
export interface IdentitySession {
  readonly name: string;
  readonly role: Role;
  /** Every cookie of the session that applies to the audited host, with its protective flags. */
  readonly cookies: readonly CookieFlags[];
  /** The `Cookie` header that replays the session. It holds credentials: never log or record it. */
  readonly cookieHeader: string;
}

/** The identities the authorization names, signed in, plus the reason any of them could not be. */
export class IdentitySessions {
  constructor(
    private readonly sessions: ReadonlyMap<string, IdentitySession>,
    private readonly failures: ReadonlyMap<string, string>,
  ) {}

  all(): readonly IdentitySession[] {
    return [...this.sessions.values()];
  }

  /** The first signed-in identity with `role`. */
  byRole(role: Role): IdentitySession | undefined {
    return this.all().find((session) => session.role === role);
  }

  /** Why identities are missing, for a check that cannot run without them. */
  describeFailures(): string | undefined {
    if (this.failures.size === 0) {
      return undefined;
    }
    return [...this.failures].map(([name, reason]) => `${name}: ${reason}`).join('; ');
  }
}

export const NO_IDENTITY_SESSIONS = new IdentitySessions(new Map(), new Map());

function isForHost(cookie: StoredCookie, hostname: string): boolean {
  const domain = cookie.domain.replace(/^\./u, '');
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isLive(cookie: StoredCookie, nowMs: number): boolean {
  // Playwright marks a session cookie with an expiry of -1.
  return cookie.expires === -1 || cookie.expires * 1000 > nowMs;
}

function toFlags(cookie: StoredCookie): CookieFlags {
  return {
    name: cookie.name,
    isHttpOnly: cookie.httpOnly,
    isSecure: cookie.secure,
    sameSite: cookie.sameSite.toLowerCase(),
  };
}

/** Reduces a storage state to the session the audit replays; exported for tests. */
export function toIdentitySession(
  name: string,
  role: Role,
  storageState: StorageState,
  baseUrl: string,
  nowMs: number,
): IdentitySession {
  const { hostname } = new URL(baseUrl);
  const applicable = storageState.cookies.filter(
    (cookie) => isForHost(cookie, hostname) && isLive(cookie, nowMs),
  );
  return {
    name,
    role,
    cookies: applicable.map(toFlags),
    cookieHeader: applicable.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
  };
}

export interface OpenIdentitySessionsOptions {
  /** Endpoints of Chrome instances the operator is already signed into, by identity name (`cdp-attach` identities). */
  readonly cdpEndpointUrls?: Readonly<Record<string, string>>;
  /** Supplies a storage state instead of signing in; for tests. */
  readonly storageStateFor?: (name: string) => Promise<StorageState | undefined>;
}

/**
 * Signs in the identities the authorization names. A saved storage state is used when there is
 * one; otherwise the identity signs in through the same `authenticate()` the explorer uses, and a
 * scripted login whose page is outside the authorized origin is refused before the browser starts.
 * An identity that cannot sign in is reported, not fatal: the checks that need it say `blocked`.
 */
export async function openIdentitySessions(
  context: EngineContext,
  authorization: SecurityAuthorization,
  options: OpenIdentitySessionsOptions = {},
): Promise<IdentitySessions> {
  const config = await loadConfig(context);
  const environment = config.environments[authorization.environment.name];
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const savedSessions = new AuthSessionStore(store);
  const sessions = new Map<string, IdentitySession>();
  const failures = new Map<string, string>();

  for (const { name, role } of authorization.identities) {
    const identity = config.identities[name];
    try {
      if (identity === undefined) {
        throw new QaError('SECURITY_IDENTITY_UNKNOWN', `"${name}" is not a configured identity`);
      }
      const storageState =
        (await (options.storageStateFor ?? ((identityName) => savedSessions.load(identityName)))(name)) ??
        (await signIn(context, authorization, name, identity, options, environment?.tlsInsecure === true));
      sessions.set(
        name,
        toIdentitySession(
          name,
          role,
          storageState,
          authorization.environment.baseUrl,
          context.clock.now().getTime(),
        ),
      );
    } catch (error) {
      if (!(error instanceof QaError)) {
        throw error;
      }
      context.logger.error('A security audit identity could not sign in', {
        code: error.code,
        identity: name,
      });
      failures.set(name, error.message);
    }
  }
  return new IdentitySessions(sessions, failures);
}

async function signIn(
  context: EngineContext,
  authorization: SecurityAuthorization,
  name: string,
  identity: IdentityConfig,
  options: OpenIdentitySessionsOptions,
  tlsInsecure: boolean,
): Promise<StorageState> {
  const { baseUrl, allowlist } = authorization.environment;
  if (identity.loginUrl !== undefined && !isUrlAllowed(identity.loginUrl, allowlist, baseUrl)) {
    throw new QaError(
      'SECURITY_IDENTITY_LOGIN_OUTSIDE_ALLOWLIST',
      `The sign-in page of "${name}" is outside the authorized origin`,
      { remediation: 'Authorize the environment the sign-in page belongs to, or sign in with cdp-attach.' },
    );
  }
  const cdpEndpointUrl = options.cdpEndpointUrls?.[name];
  return authenticate(context.browserLauncher, identity, context.env, {
    ...(cdpEndpointUrl !== undefined ? { cdpEndpointUrl } : {}),
    ...(tlsInsecure ? { tlsInsecure: true } : {}),
  });
}
