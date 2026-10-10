// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { NO_IDENTITY_SESSIONS } from '../identity-sessions.js';
import { scriptedProbe, type ScriptedResponse } from '../test-support/scripted-probe.js';
import { headersCheck } from './headers-check.js';

const PROTECTED: Readonly<Record<string, string>> = {
  'content-security-policy': "default-src 'self'; frame-ancestors 'self'",
  'x-content-type-options': 'nosniff',
  'strict-transport-security': 'max-age=31536000',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

async function runRoutes(routes: Readonly<Record<string, ScriptedResponse>>, baseUrl: string) {
  const { probe, authorization, requests } = scriptedProbe((request) => routes[request.path] ?? {}, baseUrl);
  const outcome = await headersCheck.run({ probe, authorization, identities: NO_IDENTITY_SESSIONS });
  return { outcome, requests, ids: outcome.findings.map((finding) => finding.id) };
}

function run(response: ScriptedResponse, baseUrl: string) {
  return runRoutes({ '/': response }, baseUrl);
}

describe('headersCheck', () => {
  it('reports nothing for a page that sets every protection', async () => {
    const { outcome } = await run({ headers: PROTECTED }, 'https://app.example.test/');

    expect(outcome.findings).toEqual([]);
    expect(outcome.status).toBe('passed');
  });

  it('reports every missing protection of a plain-HTTP page, but not HSTS', async () => {
    const { ids } = await run({ headers: {} }, 'http://app.example.test/');

    expect(ids).toEqual([
      'headers-content-security-policy',
      'headers-x-content-type-options',
      'headers-framing',
      'headers-referrer-policy',
    ]);
  });

  it('reports a missing HSTS header on an HTTPS site', async () => {
    const withoutHsts = Object.fromEntries(
      Object.entries(PROTECTED).filter(([name]) => name !== 'strict-transport-security'),
    );

    const { ids } = await run({ headers: withoutHsts }, 'https://app.example.test/');

    expect(ids).toEqual(['headers-strict-transport-security']);
  });

  it('accepts either X-Frame-Options or a CSP frame-ancestors directive against framing', async () => {
    const framedByHeader = await run(
      {
        headers: {
          ...PROTECTED,
          'content-security-policy': "default-src 'self'",
          'x-frame-options': 'DENY',
        },
      },
      'https://app.example.test/',
    );
    const framedByCsp = await run({ headers: PROTECTED }, 'https://app.example.test/');
    const unprotected = await run(
      { headers: { ...PROTECTED, 'content-security-policy': "default-src 'self'" } },
      'https://app.example.test/',
    );

    expect(framedByHeader.ids).toEqual([]);
    expect(framedByCsp.ids).toEqual([]);
    expect(unprotected.ids).toEqual(['headers-framing']);
  });

  it('wants nosniff exactly, in any case', async () => {
    const lower = await run(
      { headers: { ...PROTECTED, 'x-content-type-options': 'NoSniff' } },
      'https://app.example.test/',
    );
    const wrong = await run(
      { headers: { ...PROTECTED, 'x-content-type-options': 'sniff' } },
      'https://app.example.test/',
    );

    expect(lower.ids).toEqual([]);
    expect(wrong.ids).toEqual(['headers-x-content-type-options']);
  });

  it('reports a framework named in X-Powered-By, and a versioned Server header', async () => {
    const poweredBy = await run(
      { headers: { ...PROTECTED, 'x-powered-by': 'Express' } },
      'https://app.example.test/',
    );
    const versioned = await run(
      { headers: { ...PROTECTED, server: 'nginx/1.25.3' } },
      'https://app.example.test/',
    );
    const plain = await run({ headers: { ...PROTECTED, server: 'nginx' } }, 'https://app.example.test/');

    expect(poweredBy.ids).toEqual(['headers-technology-banner']);
    expect(poweredBy.outcome.findings[0]?.actualResult).toBe('The response sent "Express"');
    expect(versioned.ids).toEqual(['headers-technology-banner']);
    expect(versioned.outcome.findings[0]).toMatchObject({
      confidence: 'medium',
      severityProposal: 'trivial',
    });
    expect(plain.ids).toEqual([]);
  });

  it('reads the page a redirect leads to and cites that response', async () => {
    const { outcome, requests } = await runRoutes(
      {
        '/': { status: 302, headers: { location: '/dashboard' } },
        '/dashboard': { headers: {} },
      },
      'http://app.example.test/',
    );

    expect(requests.map((request) => request.path)).toEqual(['/', '/dashboard']);
    expect(outcome.note).toBe('Read the headers of /dashboard.');
    expect(outcome.findings[0]).toMatchObject({
      requestIndexes: [1],
      actualResult: 'GET /dashboard answered 200 without it',
    });
    expect(outcome.findings[0]?.steps[0]).toBe('Request / and follow it to /dashboard');
  });

  it('gives each finding what a reviewer needs to act on it', async () => {
    const { outcome } = await run({ headers: {} }, 'http://app.example.test/');
    const finding = outcome.findings.find((candidate) => candidate.id === 'headers-content-security-policy');

    expect(finding).toMatchObject({
      checkClass: 'headers',
      confidence: 'high',
      severityProposal: 'minor',
      expectedResult: expect.stringContaining('Content-Security-Policy') as unknown,
      remediation: expect.stringContaining('Content-Security-Policy') as unknown,
      regressionCheck: 'Assert that GET / returns the content-security-policy protection',
    });
  });
});
