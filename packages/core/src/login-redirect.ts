// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// A path segment that names a sign-in page: /login, /log-in, /signin, /sign-in, /sso, as a whole segment.
const LOGIN_SEGMENT = /(?:^|\/)(?:log-?in|sign-?in|sso)(?:\/|$)/iu;

function pathOf(url: string, base: string): string | undefined {
  try {
    return new URL(url, base).pathname;
  } catch {
    return undefined;
  }
}

function isLoginPath(pathname: string, loginPaths: readonly string[]): boolean {
  return LOGIN_SEGMENT.test(pathname) || loginPaths.includes(pathname);
}

/**
 * Where a response sent the caller to sign in, or `undefined`. An API call that lands on a login
 * page (the application redirected an unauthenticated request, or a session lapsed) proves nothing
 * about the endpoint, even when the page itself answers 200. `target` is the redirect's location or
 * the URL the redirects ended on; `loginPaths` are the paths of the configured identities' login
 * URLs. A request that was itself aimed at a login page is not a redirect to one.
 */
export function findLoginRedirect(
  requestUrl: string,
  target: string | undefined,
  loginPaths: readonly string[],
): string | undefined {
  if (target === undefined) {
    return undefined;
  }
  const requested = pathOf(requestUrl, requestUrl);
  const reached = pathOf(target, requestUrl);
  if (requested === undefined || reached === undefined || reached === requested) {
    return undefined;
  }
  if (isLoginPath(requested, loginPaths) || !isLoginPath(reached, loginPaths)) {
    return undefined;
  }
  return reached;
}

/** The paths of the login URLs the configuration names, for `findLoginRedirect`. */
export function loginPathsOf(
  identities: Readonly<Record<string, { readonly loginUrl?: string | undefined }>>,
  baseUrl: string,
): readonly string[] {
  return Object.values(identities).flatMap((identity) => {
    const path = identity.loginUrl === undefined ? undefined : pathOf(identity.loginUrl, baseUrl);
    return path === undefined ? [] : [path];
  });
}
