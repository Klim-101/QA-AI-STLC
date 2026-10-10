// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { looksLikeSessionCookie, parseSetCookie } from './cookie-flags.js';
import { buildFinding, findingId } from './finding.js';

describe('parseSetCookie', () => {
  it('reads the name and every protective attribute, in any case', () => {
    expect(parseSetCookie('sid=abc123; Path=/; HttpOnly; SECURE; SameSite=Lax')).toEqual({
      name: 'sid',
      isHttpOnly: true,
      isSecure: true,
      sameSite: 'lax',
    });
  });

  it('reports a cookie with none of the attributes', () => {
    expect(parseSetCookie('theme=dark')).toEqual({
      name: 'theme',
      isHttpOnly: false,
      isSecure: false,
      sameSite: undefined,
    });
  });

  it('never carries the value, even one that looks like another attribute', () => {
    const flags = parseSetCookie('sid=HttpOnly; Path=/');

    expect(flags).toEqual({ name: 'sid', isHttpOnly: false, isSecure: false, sameSite: undefined });
    expect(Object.values(flags ?? {})).not.toContain('HttpOnly');
  });

  it('reads SameSite=None', () => {
    expect(parseSetCookie('a=b; SameSite=None; Secure')?.sameSite).toBe('none');
  });

  it.each(['', '=value', 'novalue', '; HttpOnly'])('rejects the malformed header "%s"', (header) => {
    expect(parseSetCookie(header)).toBeUndefined();
  });
});

describe('looksLikeSessionCookie', () => {
  it.each(['connect.sid', 'PHPSESSID', 'session', 'auth_token', 'JWT', 'login-state'])(
    'treats %s as a session cookie',
    (name) => {
      expect(looksLikeSessionCookie(name)).toBe(true);
    },
  );

  it.each(['theme', 'locale', 'cookie_banner'])('does not treat %s as a session cookie', (name) => {
    expect(looksLikeSessionCookie(name)).toBe(false);
  });
});

describe('findingId', () => {
  it('reduces its parts to a plain lower-case slug', () => {
    expect(findingId('headers', 'Content-Security-Policy')).toBe('headers-content-security-policy');
    expect(findingId('errors', 'stack-trace', '/qa-audit-%ZZ')).toBe('errors-stack-trace-qa-audit-zz');
  });

  it('drops leading and trailing separators', () => {
    expect(findingId('/', 'x', '/')).toBe('x');
  });
});

describe('buildFinding', () => {
  it('builds a finding whose id is the slug of its parts', () => {
    const finding = buildFinding({
      idParts: ['cookies', 'connect.sid', 'httponly'],
      checkClass: 'cookies',
      riskArea: 'Session management',
      confidence: 'high',
      severityProposal: 'major',
      title: 't',
      steps: ['s'],
      expectedResult: 'e',
      actualResult: 'a',
      remediation: 'r',
      regressionCheck: 'c',
      requestIndexes: [0],
    });

    expect(finding.id).toBe('cookies-connect-sid-httponly');
    expect(finding).not.toHaveProperty('idParts');
  });
});
