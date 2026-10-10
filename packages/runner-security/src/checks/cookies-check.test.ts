// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { scriptedProbe, type ScriptedResponse } from '../test-support/scripted-probe.js';
import { cookiesCheck } from './cookies-check.js';

async function run(routes: Readonly<Record<string, ScriptedResponse>>, baseUrl: string) {
  const { probe, authorization } = scriptedProbe((request) => routes[request.path] ?? {}, baseUrl);
  const outcome = await cookiesCheck.run({ probe, authorization });
  return { outcome, ids: outcome.findings.map((finding) => finding.id) };
}

const HTTP = 'http://app.example.test/';
const HTTPS = 'https://app.example.test/';

describe('cookiesCheck', () => {
  it('is skipped, not passed, when the application sets no cookie for an anonymous visitor', async () => {
    const { outcome } = await run({}, HTTP);

    expect(outcome.status).toBe('skipped');
    expect(outcome.note).toContain('once an identity signs in');
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
      note: 'Checked 1 cookie(s) set for an anonymous visitor.',
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
    expect(outcome.note).toBe('Checked 2 cookie(s) set for an anonymous visitor.');
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
    expect(outcome.note).toBe('Checked 1 cookie(s) set for an anonymous visitor.');
  });

  it('cites the request that set the cookie', async () => {
    const { outcome } = await run({ '/login': { setCookies: ['sid=abc; SameSite=Lax'] } }, HTTP);

    expect(outcome.findings[0]?.requestIndexes).toEqual([1]);
  });
});
