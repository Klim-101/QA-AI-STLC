// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { NO_IDENTITY_SESSIONS, type IdentitySessions } from '../identity-sessions.js';
import {
  identitySession,
  scriptedProbe,
  sessionsOf,
  type ScriptedResponse,
} from '../test-support/scripted-probe.js';
import { cookiesCheck } from './cookies-check.js';

async function run(
  routes: Readonly<Record<string, ScriptedResponse>>,
  baseUrl: string,
  identities: IdentitySessions = NO_IDENTITY_SESSIONS,
) {
  const { probe, authorization } = scriptedProbe((request) => routes[request.path] ?? {}, baseUrl);
  const outcome = await cookiesCheck.run({ probe, authorization, identities });
  return { outcome, ids: outcome.findings.map((finding) => finding.id) };
}

const HTTP = 'http://app.example.test/';
const HTTPS = 'https://app.example.test/';

describe('cookiesCheck', () => {
  it('is skipped, not passed, when the application sets no cookie for an anonymous visitor', async () => {
    const { outcome } = await run({}, HTTP);

    expect(outcome.status).toBe('skipped');
    expect(outcome.note).toContain('no identity was signed in');
    expect(outcome.findings).toEqual([]);
  });

  it('is skipped when the only Set-Cookie header is malformed', async () => {
    const { outcome } = await run({ '/': { setCookies: ['=nothing', 'novalue'] } }, HTTP);

    expect(outcome.status).toBe('skipped');
  });

  it('passes a cookie that carries every protection', async () => {
    const { outcome } = await run(
      { '/': { setCookies: ['sid=abc; HttpOnly; Secure; SameSite=Lax'] } },
      HTTPS,
    );

    expect(outcome).toMatchObject({
      status: 'passed',
      note: 'Checked 1 cookie(s) held by anonymous visitors and signed-in identities.',
      findings: [],
    });
  });

  it('flags a session cookie readable by scripts as a major finding that never quotes its value', async () => {
    const { outcome } = await run(
      { '/': { setCookies: ['connect.sid=s%3Asecret-value; Path=/; SameSite=Lax'] } },
      HTTP,
    );

    expect(outcome.findings).toHaveLength(1);
    expect(outcome.findings[0]).toMatchObject({
      id: 'cookies-connect-sid-httponly',
      severityProposal: 'major',
      confidence: 'high',
      title: 'The "connect.sid" cookie lacks HttpOnly',
      riskArea: 'Session management',
    });
    expect(JSON.stringify(outcome.findings)).not.toContain('secret-value');
  });

  it('flags a missing Secure flag only on an HTTPS site', async () => {
    const cookie = 'sid=abc; HttpOnly; SameSite=Lax';

    const http = await run({ '/': { setCookies: [cookie] } }, HTTP);
    const https = await run({ '/': { setCookies: [cookie] } }, HTTPS);

    expect(http.ids).toEqual([]);
    expect(https.ids).toEqual(['cookies-sid-secure']);
    expect(https.outcome.findings[0]?.severityProposal).toBe('major');
  });

  it('ranks a missing SameSite policy as minor, even for a session cookie', async () => {
    const none = await run({ '/': { setCookies: ['sid=abc; HttpOnly; SameSite=None; Secure'] } }, HTTPS);
    const absent = await run({ '/': { setCookies: ['sid=abc; HttpOnly; Secure'] } }, HTTPS);

    expect(none.ids).toEqual(['cookies-sid-samesite']);
    expect(none.outcome.findings[0]?.severityProposal).toBe('minor');
    expect(absent.ids).toEqual(['cookies-sid-samesite']);
  });

  it('ranks the same gap in a cookie that is not a session as minor', async () => {
    const { outcome } = await run({ '/': { setCookies: ['theme=dark; SameSite=Lax'] } }, HTTP);

    expect(outcome.findings).toMatchObject([{ id: 'cookies-theme-httponly', severityProposal: 'minor' }]);
  });

  it('reads a cookie set on a redirect and on the sign-in page', async () => {
    const { outcome } = await run(
      {
        '/': { status: 302, headers: { location: '/dashboard' }, setCookies: ['sid=abc; SameSite=Lax'] },
        '/login': { setCookies: ['csrf=xyz; HttpOnly; SameSite=Lax'] },
      },
      HTTP,
    );

    expect(outcome.findings.map((finding) => finding.id)).toEqual(['cookies-sid-httponly']);
    expect(outcome.note).toBe('Checked 2 cookie(s) held by anonymous visitors and signed-in identities.');
  });

  it('keeps the last Set-Cookie of a name, as a browser would', async () => {
    const { outcome } = await run(
      {
        '/': { setCookies: ['sid=old; SameSite=Lax'] },
        '/login': { setCookies: ['sid=new; HttpOnly; SameSite=Lax'] },
      },
      HTTP,
    );

    expect(outcome.findings).toEqual([]);
    expect(outcome.note).toBe('Checked 1 cookie(s) held by anonymous visitors and signed-in identities.');
  });

  it('cites the request that set the cookie', async () => {
    const { outcome } = await run({ '/login': { setCookies: ['sid=abc; SameSite=Lax'] } }, HTTP);

    expect(outcome.findings[0]?.requestIndexes).toEqual([1]);
  });
});

describe('cookiesCheck with signed-in identities', () => {
  const unprotected = { name: 'connect.sid', isHttpOnly: false, isSecure: false, sameSite: 'lax' };

  it('finds the session cookie of a signed-in identity that scripts can read, citing no request', async () => {
    const { outcome } = await run({}, HTTP, sessionsOf([identitySession('member', 'low', [unprotected])]));

    expect(outcome.findings).toHaveLength(1);
    expect(outcome.findings[0]).toMatchObject({
      id: 'cookies-connect-sid-httponly',
      severityProposal: 'major',
      confidence: 'high',
      requestIndexes: [],
      steps: [
        'Sign in as the signed-in identity "member"',
        'Read the attributes of the cookies the browser session holds',
      ],
    });
  });

  it('passes when the identity holds protected cookies', async () => {
    const protectedCookie = { name: 'sid', isHttpOnly: true, isSecure: true, sameSite: 'strict' };

    const { outcome } = await run(
      {},
      HTTPS,
      sessionsOf([identitySession('member', 'low', [protectedCookie])]),
    );

    expect(outcome).toMatchObject({ status: 'passed', findings: [] });
  });

  it('prefers the session cookie over the anonymous one of the same name', async () => {
    const { outcome } = await run(
      { '/': { setCookies: ['sid=anon; HttpOnly; SameSite=Lax'] } },
      HTTP,
      sessionsOf([
        identitySession('member', 'low', [
          { name: 'sid', isHttpOnly: false, isSecure: false, sameSite: 'lax' },
        ]),
      ]),
    );

    expect(outcome.findings.map((finding) => finding.id)).toEqual(['cookies-sid-httponly']);
  });

  it('is blocked, not skipped, when an identity could not sign in and no cookie was seen', async () => {
    const { outcome } = await run({}, HTTP, sessionsOf([], { member: 'sign-in failed' }));

    expect(outcome.status).toBe('blocked');
    expect(outcome.note).toContain('member: sign-in failed');
  });

  it('is uncertain when cookies are fine but an identity could not sign in', async () => {
    const { outcome } = await run(
      { '/': { setCookies: ['sid=abc; HttpOnly; SameSite=Lax'] } },
      HTTP,
      sessionsOf([], { member: 'sign-in failed' }),
    );

    expect(outcome.status).toBe('uncertain');
    expect(outcome.note).toContain('could not sign in');
  });

  it('still reports a finding when an identity could not sign in', async () => {
    const { outcome } = await run(
      { '/': { setCookies: ['sid=abc; SameSite=Lax'] } },
      HTTP,
      sessionsOf([], { member: 'sign-in failed' }),
    );

    expect(outcome.status).toBe('passed');
    expect(outcome.findings).toHaveLength(1);
  });
});
