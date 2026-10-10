// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

export interface CookieFlags {
  readonly name: string;
  readonly isHttpOnly: boolean;
  readonly isSecure: boolean;
  /** Lower-cased `lax`, `strict` or `none`; `undefined` when the cookie names no SameSite policy. */
  readonly sameSite: string | undefined;
}

/**
 * Reads the name and protective attributes from one `Set-Cookie` header value. The value itself is
 * never read into the result: a session cookie must not reach a finding, a log or evidence.
 */
export function parseSetCookie(header: string): CookieFlags | undefined {
  const [pair = '', ...attributes] = header.split(';').map((part) => part.trim());
  const name = pair.slice(0, Math.max(pair.indexOf('='), 0)).trim();
  if (name.length === 0) {
    return undefined;
  }
  const lowered = attributes.map((attribute) => attribute.toLowerCase());
  const sameSiteAttribute = lowered.find((attribute) => attribute.startsWith('samesite='));
  return {
    name,
    isHttpOnly: lowered.includes('httponly'),
    isSecure: lowered.includes('secure'),
    sameSite: sameSiteAttribute?.slice('samesite='.length),
  };
}

// A cookie that carries a login. Names differ by framework, so this is a deliberately broad guess
// used only to rank severity, never to decide whether something is reported.
const SESSION_COOKIE_NAME = /sess|sid|token|auth|jwt|login/iu;

export function looksLikeSessionCookie(name: string): boolean {
  return SESSION_COOKIE_NAME.test(name);
}
