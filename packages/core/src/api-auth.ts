// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { ApiAuthConfig, ApiAuthProfile } from '@qa-ai-stlc/schemas';
import type { SensitiveNames } from './api-auth-redaction.js';
import { assertUrlAllowed } from './browser-allowlist.js';
import type { EngineContext } from './engine-context.js';
import { QaError } from './errors.js';

// A token is treated as expired slightly early so a request never starts with one that lapses
// in flight.
const TOKEN_EXPIRY_SKEW_MS = 30_000;
const TOKEN_REQUEST_TIMEOUT_MS = 30_000;

interface CachedToken {
  readonly value: string;
  readonly expiresAtMs: number | undefined;
}

/**
 * Tokens obtained for the life of one engine process, keyed by profile name. Held in memory only:
 * nothing here is ever written to disk (ADR-0012).
 */
export interface ApiAuthTokenCache {
  get(profileName: string, nowMs: number): string | undefined;
  set(profileName: string, token: string, expiresAtMs: number | undefined): void;
  /** Every live token, so a response that echoes one can be scrubbed. */
  delete(profileName: string): void;
  values(): readonly string[];
}

export function createApiAuthTokenCache(): ApiAuthTokenCache {
  const tokens = new Map<string, CachedToken>();
  return {
    get: (profileName, nowMs) => {
      const cached = tokens.get(profileName);
      if (cached?.expiresAtMs !== undefined && cached.expiresAtMs <= nowMs) {
        tokens.delete(profileName);
        return undefined;
      }
      return cached?.value;
    },
    set: (profileName, token, expiresAtMs) => {
      tokens.set(profileName, { value: token, expiresAtMs });
    },
    delete: (profileName) => {
      tokens.delete(profileName);
    },
    values: () => [...tokens.values()].map((cached) => cached.value),
  };
}

export interface ResolvedApiAuth {
  readonly profileName: string;
  readonly profileType: ApiAuthProfile['type'];
  readonly headers: Readonly<Record<string, string>>;
  readonly queryParameters: Readonly<Record<string, string>>;
  /** Every credential value this resolution used; never returned to the agent. */
  readonly secretValues: readonly string[];
  /** True when the credential came from the cache, so a 401 may mean it went stale and a new one is worth trying once. */
  readonly isReused: boolean;
}

export interface ResolveApiAuthOptions {
  readonly profileName: string;
  readonly apiAuth: ApiAuthConfig;
  readonly environment: {
    readonly allowlist: readonly string[];
    readonly baseUrl: string;
    readonly tlsInsecure?: boolean | undefined;
  };
  readonly tokenCache: ApiAuthTokenCache;
  readonly signal?: AbortSignal;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled apiAuth profile: ${JSON.stringify(value)}`);
}

function unknownProfileError(apiAuth: ApiAuthConfig, profileName: string): QaError {
  const known = Object.keys(apiAuth.profiles).join(', ') || '(none configured)';
  return new QaError('API_AUTH_PROFILE_UNKNOWN', `"${profileName}" is not a configured apiAuth profile`, {
    remediation: `Use one of: ${known}. Profiles are defined under "apiAuth" in .qa/config.yaml.`,
  });
}

/**
 * The profile a call uses: the one the caller named, else the environment's default, else none
 * (`undefined`). A name that is not configured is an error rather than a silent unauthenticated
 * call.
 */
export function selectApiAuthProfileName(
  apiAuth: ApiAuthConfig,
  environmentName: string,
  requested: string | undefined,
): string | undefined {
  const profileName = requested ?? apiAuth.defaults[environmentName];
  if (profileName !== undefined && !(profileName in apiAuth.profiles)) {
    throw unknownProfileError(apiAuth, profileName);
  }
  return profileName;
}

/**
 * Header and query-parameter names that any configured profile uses to carry a credential. They
 * are redacted by name wherever a request or response is stored, whichever profile the call used.
 */
export function collectSensitiveNames(apiAuth: ApiAuthConfig): SensitiveNames {
  const headers = new Set<string>();
  const queryParameters = new Set<string>();
  for (const profile of Object.values(apiAuth.profiles)) {
    switch (profile.type) {
      case 'api-key':
        (profile.in === 'header' ? headers : queryParameters).add(profile.name);
        break;
      case 'custom-headers':
        Object.keys(profile.headers).forEach((name) => headers.add(name));
        break;
      case 'basic':
      case 'bearer':
      case 'oauth2-client-credentials':
      case 'from-browser':
        headers.add('Authorization');
        break;
      case 'none':
        break;
      default:
        assertNever(profile);
    }
  }
  return { headers: [...headers], queryParameters: [...queryParameters] };
}

const BUILT_IN_CREDENTIAL_HEADER_NAMES: readonly string[] = ['authorization', 'cookie'];

/**
 * Rejects a credential the caller supplied itself: an `Authorization` or `Cookie` header, or any
 * header or query-parameter name a profile declares. Credentials come from a profile so the value
 * never passes through a tool argument (ADR-0012); throws `HTTP_CREDENTIAL_INPUT_REJECTED`.
 */
export function assertNoCredentialInputs(
  url: string,
  headers: Readonly<Record<string, string>> | undefined,
  names: SensitiveNames,
): void {
  const headerNames = new Set([
    ...BUILT_IN_CREDENTIAL_HEADER_NAMES,
    ...names.headers.map((name) => name.toLowerCase()),
  ]);
  const queryNames = new Set(names.queryParameters.map((name) => name.toLowerCase()));
  const header = Object.keys(headers ?? {}).find((name) => headerNames.has(name.toLowerCase()));
  const queryParameter = [...new URL(url).searchParams.keys()].find((name) =>
    queryNames.has(name.toLowerCase()),
  );
  const offender =
    header !== undefined
      ? `header "${header}"`
      : queryParameter !== undefined
        ? `query parameter "${queryParameter}"`
        : undefined;
  if (offender !== undefined) {
    throw new QaError('HTTP_CREDENTIAL_INPUT_REJECTED', `The ${offender} carries a credential`, {
      remediation:
        'Pass "auth" with the name of an apiAuth profile from .qa/config.yaml instead; the engine adds the credential itself.',
    });
  }
}

function readVariable(context: EngineContext, variableName: string): string {
  const value = context.env[variableName];
  if (value === undefined || value.length === 0) {
    throw new QaError('API_AUTH_VARIABLE_MISSING', `The environment variable ${variableName} is not set`, {
      remediation: `Set ${variableName} in the shell that starts the engine. Its value is never read back to you or written to disk.`,
    });
  }
  return value;
}

async function fetchOAuthToken(
  context: EngineContext,
  options: ResolveApiAuthOptions,
  profile: Extract<ApiAuthProfile, { type: 'oauth2-client-credentials' }>,
): Promise<{ readonly token: string; readonly expiresAtMs: number | undefined }> {
  // The token request is fixed by configuration, but it still sends a client secret to a host, so
  // it faces the same allowlist as every other call (ADR-0012).
  assertUrlAllowed(profile.tokenUrl, options.environment.allowlist, options.environment.baseUrl);

  const form = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: readVariable(context, profile.clientIdVariable),
    client_secret: readVariable(context, profile.clientSecretVariable),
    ...(profile.scope !== undefined ? { scope: profile.scope } : {}),
  });
  const response = await context.httpClient.request(profile.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: form.toString(),
    // A redirect would replay the client secret to a host the allowlist never saw.
    redirect: 'manual',
    signal: options.signal ?? AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
    ...(options.environment.tlsInsecure === true ? { tlsInsecure: true } : {}),
  });
  if (!response.ok) {
    throw new QaError(
      'API_AUTH_TOKEN_REQUEST_FAILED',
      `The token endpoint for profile "${options.profileName}" answered ${String(response.status)}`,
      { remediation: 'Check the client id and secret variables, the scope and the token URL.' },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.bodyText);
  } catch (cause) {
    throw new QaError(
      'API_AUTH_TOKEN_RESPONSE_INVALID',
      `The token endpoint for profile "${options.profileName}" did not return JSON`,
      { cause },
    );
  }
  const body = parsed as { access_token?: unknown; expires_in?: unknown } | null;
  if (typeof body?.access_token !== 'string' || body.access_token.length === 0) {
    throw new QaError(
      'API_AUTH_TOKEN_RESPONSE_INVALID',
      `The token endpoint for profile "${options.profileName}" returned no access_token`,
    );
  }
  const expiresAtMs =
    typeof body.expires_in === 'number'
      ? context.clock.now().getTime() + body.expires_in * 1000 - TOKEN_EXPIRY_SKEW_MS
      : undefined;
  return { token: body.access_token, expiresAtMs };
}

async function resolveOAuthToken(
  context: EngineContext,
  options: ResolveApiAuthOptions,
  profile: Extract<ApiAuthProfile, { type: 'oauth2-client-credentials' }>,
): Promise<{ readonly token: string; readonly isReused: boolean }> {
  const cached = options.tokenCache.get(options.profileName, context.clock.now().getTime());
  if (cached !== undefined) {
    return { token: cached, isReused: true };
  }
  const fetched = await fetchOAuthToken(context, options, profile);
  options.tokenCache.set(options.profileName, fetched.token, fetched.expiresAtMs);
  return { token: fetched.token, isReused: false };
}

/**
 * Turns a configured profile into the headers or query parameters to add to one request. Secret
 * values come from `context.env` and are returned only so the caller can scrub them from stored
 * evidence; they never reach the agent (ADR-0012). Throws `API_AUTH_VARIABLE_MISSING` naming the
 * variable, never its value.
 */
export async function resolveApiAuth(
  context: EngineContext,
  options: ResolveApiAuthOptions,
): Promise<ResolvedApiAuth> {
  const profile = options.apiAuth.profiles[options.profileName];
  if (profile === undefined) {
    throw unknownProfileError(options.apiAuth, options.profileName);
  }
  const base = { profileName: options.profileName, profileType: profile.type, isReused: false };
  switch (profile.type) {
    case 'none':
      return { ...base, headers: {}, queryParameters: {}, secretValues: [] };
    case 'basic': {
      const username = readVariable(context, profile.usernameVariable);
      const password = readVariable(context, profile.passwordVariable);
      const encoded = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
      return {
        ...base,
        headers: { Authorization: `Basic ${encoded}` },
        queryParameters: {},
        secretValues: [password, encoded],
      };
    }
    case 'bearer': {
      const token = readVariable(context, profile.tokenVariable);
      return {
        ...base,
        headers: { Authorization: `Bearer ${token}` },
        queryParameters: {},
        secretValues: [token],
      };
    }
    case 'api-key': {
      const key = readVariable(context, profile.keyVariable);
      return {
        ...base,
        headers: profile.in === 'header' ? { [profile.name]: key } : {},
        queryParameters: profile.in === 'query' ? { [profile.name]: key } : {},
        secretValues: [key],
      };
    }
    case 'custom-headers': {
      const headers: Record<string, string> = {};
      for (const [headerName, variableName] of Object.entries(profile.headers)) {
        headers[headerName] = readVariable(context, variableName);
      }
      return { ...base, headers, queryParameters: {}, secretValues: Object.values(headers) };
    }
    case 'oauth2-client-credentials': {
      const { token, isReused } = await resolveOAuthToken(context, options, profile);
      return {
        ...base,
        isReused,
        headers: { Authorization: `Bearer ${token}` },
        queryParameters: {},
        secretValues: [token],
      };
    }
    case 'from-browser':
      throw new QaError(
        'API_AUTH_PROFILE_UNSUPPORTED',
        `Profile "${options.profileName}" reads its token from a browser session, which this engine version cannot do yet`,
        { remediation: 'Copy the token into a QA_* variable and use a "bearer" profile instead.' },
      );
    default:
      return assertNever(profile);
  }
}
