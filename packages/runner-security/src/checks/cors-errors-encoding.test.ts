// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { NO_IDENTITY_SESSIONS } from '../identity-sessions.js';
import {
  scriptedProbe,
  type ScriptedRequest,
  type ScriptedResponse,
} from '../test-support/scripted-probe.js';
import { corsCheck } from './cors-check.js';
import { encodingCheck } from './encoding-check.js';
import { errorsCheck } from './errors-check.js';

const FOREIGN = 'https://qa-audit-untrusted.example.test';

async function runWith(check: typeof corsCheck, respond: (request: ScriptedRequest) => ScriptedResponse) {
  const { probe, authorization, requests } = scriptedProbe(respond);
  const outcome = await check.run({ probe, authorization, identities: NO_IDENTITY_SESSIONS });
  return { outcome, requests, ids: outcome.findings.map((finding) => finding.id) };
}

describe('corsCheck', () => {
  it('reports nothing when the application sends no CORS headers', async () => {
    const { outcome, requests } = await runWith(corsCheck, () => ({}));

    expect(outcome).toMatchObject({ status: 'passed', findings: [] });
    expect(requests.map((request) => request.headers.origin)).toEqual([FOREIGN, 'null']);
  });

  it('reports a reflected foreign origin that is allowed with credentials as major', async () => {
    const { outcome } = await runWith(corsCheck, (request) => ({
      headers: {
        'access-control-allow-origin': request.headers.origin ?? '',
        'access-control-allow-credentials': 'TRUE',
      },
    }));

    expect(outcome.findings.map((finding) => [finding.id, finding.severityProposal])).toEqual([
      ['cors-reflected-origin-credentials', 'major'],
      ['cors-null-origin-credentials', 'major'],
    ]);
  });

  it('reports an allowed origin without credentials as minor', async () => {
    const { outcome } = await runWith(corsCheck, (request) => ({
      headers: { 'access-control-allow-origin': request.headers.origin ?? '' },
    }));

    expect(outcome.findings.map((finding) => [finding.id, finding.severityProposal])).toEqual([
      ['cors-reflected-origin-anonymous', 'minor'],
      ['cors-null-origin-anonymous', 'minor'],
    ]);
  });

  it('does not report a wildcard or a fixed trusted origin', async () => {
    const wildcard = await runWith(corsCheck, () => ({ headers: { 'access-control-allow-origin': '*' } }));
    const fixed = await runWith(corsCheck, () => ({
      headers: { 'access-control-allow-origin': 'https://app.example.test' },
    }));

    expect(wildcard.ids).toEqual([]);
    expect(fixed.ids).toEqual([]);
  });
});

describe('errorsCheck', () => {
  it('reports nothing for plain error pages and asks for the two error paths', async () => {
    const { outcome, requests } = await runWith(errorsCheck, () => ({
      status: 404,
      bodyText: 'Page not found.',
    }));

    expect(outcome).toMatchObject({ status: 'passed', findings: [] });
    expect(requests.map((request) => request.path)).toEqual(['/qa-audit-no-such-page', '/qa-audit-%ZZ']);
  });

  it.each([
    [
      'a Node stack trace',
      'Error: boom\n    at handler (/srv/app/routes.js:12:9)\n',
      'errors-stack-trace',
      'major',
    ],
    [
      'a Python traceback',
      'Traceback (most recent call last):\n  File "app.py"',
      'errors-stack-trace',
      'major',
    ],
    ['an SQL error', 'You have an error in your SQL syntax near', 'errors-database-error', 'major'],
    [
      'a database driver error',
      'SQLSTATE[42S02]: Base table or view not found',
      'errors-database-error',
      'major',
    ],
    [
      'a framework default page',
      '<pre>Cannot GET /qa-audit-no-such-page</pre>',
      'errors-framework-banner',
      'trivial',
    ],
  ])('reports %s', async (_label, bodyText, idPrefix, severity) => {
    const { outcome } = await runWith(errorsCheck, () => ({ status: 500, bodyText }));

    expect(outcome.findings.map((finding) => finding.id)).toEqual([
      `${idPrefix}-qa-audit-no-such-page`,
      `${idPrefix}-qa-audit-zz`,
    ]);
    expect(outcome.findings[0]).toMatchObject({
      checkClass: 'errors',
      confidence: 'high',
      severityProposal: severity,
      actualResult: expect.stringContaining('answered 500') as unknown,
    });
  });

  it('reports each kind of leak once per error path', async () => {
    const { outcome } = await runWith(errorsCheck, () => ({
      status: 500,
      bodyText: 'SQLSTATE[1] failed\nTraceback (most recent call last)',
    }));

    expect(outcome.findings).toHaveLength(4);
  });
});

describe('encodingCheck', () => {
  it('is uncertain, not passed, when nothing is reflected, and says what it tried', async () => {
    const { outcome, requests } = await runWith(encodingCheck, () => ({ bodyText: 'nothing here' }));

    expect(outcome.status).toBe('uncertain');
    expect(outcome.findings).toEqual([]);
    expect(outcome.note).toBe(
      'Tried 10 common parameter names on 2 pages; parameters the application actually reads were not discovered.',
    );
    expect(requests).toHaveLength(2);
    expect(requests[0]?.path.startsWith('/?q=')).toBe(true);
  });

  it('reports a marker that comes back with its angle brackets and quotes unencoded', async () => {
    const { outcome } = await runWith(encodingCheck, (request) =>
      request.path.startsWith('/login')
        ? { bodyText: `<p>You searched for qaaudit7q3<"'></p>` }
        : { bodyText: 'ok' },
    );

    expect(outcome.findings).toMatchObject([
      {
        id: 'encoding-reflected-login',
        checkClass: 'encoding',
        confidence: 'medium',
        severityProposal: 'major',
        actualResult: 'The marker was returned unencoded by GET /login',
        requestIndexes: [1],
      },
    ]);
  });

  it('does not report a marker that comes back encoded', async () => {
    const { outcome } = await runWith(encodingCheck, () => ({
      bodyText: 'You searched for qaaudit7q3&lt;&quot;&#39;&gt;',
    }));

    expect(outcome.findings).toEqual([]);
  });

  it('follows a redirect so it reads the page a visitor sees', async () => {
    const { outcome, requests } = await runWith(encodingCheck, (request) =>
      request.path.startsWith('/?')
        ? { status: 302, headers: { location: '/dashboard' } }
        : { bodyText: 'ok' },
    );

    expect(outcome.status).toBe('uncertain');
    expect(requests.map((request) => request.path.split('?')[0])).toEqual(['/', '/dashboard', '/login']);
  });
});
