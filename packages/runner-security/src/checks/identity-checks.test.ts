// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { SecurityAuthorization } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import type { IdentitySessions } from '../identity-sessions.js';
import type { SecurityCheck } from '../security-check.js';
import { SecurityProbe } from '../security-probe.js';
import {
  authorizationFor,
  identitySession,
  scriptedHttpClient,
  sessionsOf,
  type ScriptedRequest,
  type ScriptedResponse,
} from '../test-support/scripted-probe.js';
import { authzCheck } from './authz-check.js';
import { csrfCheck } from './csrf-check.js';

const BASE_URL = 'http://app.example.test/';
const MEMBER = identitySession('member', 'low');
const ADMIN = identitySession('admin', 'high');
const REDIRECT_TO_LOGIN: ScriptedResponse = { status: 302, headers: { location: '/login' } };

async function run(
  check: SecurityCheck,
  options: {
    readonly respond: (request: ScriptedRequest) => ScriptedResponse;
    readonly identities: IdentitySessions;
    readonly authorization?: Partial<SecurityAuthorization>;
  },
) {
  const { client, requests } = scriptedHttpClient(options.respond);
  const authorization = authorizationFor(BASE_URL, options.authorization);
  const probe = new SecurityProbe({ httpClient: client, authorization, pause: () => Promise.resolve() });
  const outcome = await check.run({ probe, authorization, identities: options.identities });
  return { outcome, requests };
}

const cookieOf = (request: ScriptedRequest): string | undefined => request.headers.cookie;

describe('authzCheck', () => {
  const restricted = { restrictedRoutes: ['/admin/users'] };

  // The privileged identity gets the page; the others get what the scenario says.
  function serving(lowSees: ScriptedResponse, anonymousSees: ScriptedResponse = REDIRECT_TO_LOGIN) {
    return (request: ScriptedRequest): ScriptedResponse => {
      if (request.path === '/login') {
        return { bodyText: 'sign in' };
      }
      const cookie = cookieOf(request);
      if (request.path === '/' && (cookie === MEMBER.cookieHeader || cookie === ADMIN.cookieHeader)) {
        return { bodyText: 'home' };
      }
      if (cookie === ADMIN.cookieHeader) {
        return { bodyText: 'ALL USERS' };
      }
      return cookie === MEMBER.cookieHeader ? lowSees : anonymousSees;
    };
  }

  it('reports a low-privilege identity that gets the very page the admin gets', async () => {
    const { outcome } = await run(authzCheck, {
      respond: serving({ bodyText: 'ALL USERS' }),
      identities: sessionsOf([MEMBER, ADMIN]),
      authorization: restricted,
    });

    expect(outcome.findings).toHaveLength(1);
    expect(outcome.findings[0]).toMatchObject({
      id: 'authz-admin-users-low-privilege',
      severityProposal: 'critical',
      confidence: 'high',
      riskArea: 'Access control: privilege escalation',
      actualResult: expect.stringContaining('identical to what the privileged identity sees') as unknown,
    });
  });

  it('is less sure when the low identity gets a different page that is still a success', async () => {
    const { outcome } = await run(authzCheck, {
      respond: serving({ bodyText: 'a public variant' }),
      identities: sessionsOf([MEMBER, ADMIN]),
      authorization: restricted,
    });

    expect(outcome.findings[0]).toMatchObject({ confidence: 'medium' });
    expect(outcome.findings[0]?.actualResult).not.toContain('identical');
  });

  it('reports a route that opens with no session at all', async () => {
    const { outcome } = await run(authzCheck, {
      respond: serving(REDIRECT_TO_LOGIN, { bodyText: 'ALL USERS' }),
      identities: sessionsOf([MEMBER, ADMIN]),
      authorization: restricted,
    });

    expect(outcome.findings.map((finding) => finding.id)).toEqual(['authz-admin-users-anonymous']);
    expect(outcome.findings[0]).toMatchObject({ riskArea: 'Access control: authentication' });
  });

  it('passes when the low identity and the anonymous visitor are both refused', async () => {
    const { outcome } = await run(authzCheck, {
      respond: serving({ status: 403 }),
      identities: sessionsOf([MEMBER, ADMIN]),
      authorization: restricted,
    });

    expect(outcome).toMatchObject({
      status: 'passed',
      note: 'Checked 1 restricted route(s).',
      findings: [],
    });
  });

  it('treats a redirect to sign in as a refusal, not as reaching the route', async () => {
    const { outcome } = await run(authzCheck, {
      respond: serving(REDIRECT_TO_LOGIN),
      identities: sessionsOf([MEMBER, ADMIN]),
      authorization: restricted,
    });

    expect(outcome.findings).toEqual([]);
  });

  it('cannot judge a route that the privileged identity cannot reach either', async () => {
    const { outcome, requests } = await run(authzCheck, {
      respond: (request) => (request.path === '/' ? { bodyText: 'home' } : { status: 404 }),
      identities: sessionsOf([MEMBER, ADMIN]),
      authorization: restricted,
    });

    expect(outcome.status).toBe('uncertain');
    expect(outcome.note).toContain('/admin/users');
    expect(requests.map((request) => request.path)).toEqual(['/', '/admin/users']);
  });

  it('does not read a dead session as a refusal: with the low identity signed out it is uncertain, not passed', async () => {
    const { outcome, requests } = await run(authzCheck, {
      respond: (request) => (request.path === '/login' ? { bodyText: 'sign in' } : REDIRECT_TO_LOGIN),
      identities: sessionsOf([MEMBER, ADMIN]),
      authorization: restricted,
    });

    expect(outcome.status).toBe('uncertain');
    expect(outcome.note).toBe(
      'The "member" session was not accepted on /, so a refusal elsewhere would prove nothing.',
    );
    expect(requests.some((request) => request.path === '/admin/users')).toBe(false);
  });

  it('notes the routes it could not judge next to the ones it could', async () => {
    const { outcome } = await run(authzCheck, {
      respond: (request) => (request.path === '/gone' ? { status: 404 } : serving({ status: 403 })(request)),
      identities: sessionsOf([MEMBER, ADMIN]),
      authorization: { restrictedRoutes: ['/admin/users', '/gone'] },
    });

    expect(outcome.status).toBe('uncertain');
    expect(outcome.note).toBe(
      'The privileged identity could not reach /gone, so access to it could not be judged.',
    );
  });

  it('still reports a finding on one route when another could not be judged, and says so', async () => {
    const { outcome } = await run(authzCheck, {
      respond: (request) =>
        request.path === '/gone' ? { status: 404 } : serving({ bodyText: 'ALL USERS' })(request),
      identities: sessionsOf([MEMBER, ADMIN]),
      authorization: { restrictedRoutes: ['/admin/users', '/gone'] },
    });

    expect(outcome.findings.map((finding) => finding.id)).toEqual(['authz-admin-users-low-privilege']);
    expect(outcome.note).toBe('Not judged, because the privileged identity could not reach them: /gone.');
  });

  it('is skipped when the authorization names no restricted route', async () => {
    const { outcome } = await run(authzCheck, {
      respond: () => ({}),
      identities: sessionsOf([MEMBER, ADMIN]),
    });

    expect(outcome.status).toBe('skipped');
    expect(outcome.note).toBe('The authorization names no restricted route.');
  });

  it('is skipped without both a low and a high identity, and blocked when one failed to sign in', async () => {
    const onlyLow = await run(authzCheck, {
      respond: () => ({}),
      identities: sessionsOf([MEMBER]),
      authorization: restricted,
    });
    const failed = await run(authzCheck, {
      respond: () => ({}),
      identities: sessionsOf([MEMBER], { admin: 'password variable not set' }),
      authorization: restricted,
    });

    expect(onlyLow.outcome.status).toBe('skipped');
    expect(onlyLow.outcome.note).toContain('role low and one with role high');
    expect(failed.outcome.status).toBe('blocked');
    expect(failed.outcome.note).toContain('admin: password variable not set');
  });
});

describe('csrfCheck', () => {
  const FORM = 'title=qa-ai-stlc+audit';
  const mutation = {
    method: 'POST',
    path: '/tasks',
    reason: 'Creates a record that carries the owner marker',
    body: FORM,
    contentType: 'application/x-www-form-urlencoded',
  } satisfies SecurityAuthorization['allowedMutations'][number];
  const authorization: Partial<SecurityAuthorization> = { allowedMutations: [mutation] };

  it('reports a mutation that is redirected on to success without any token', async () => {
    const { outcome, requests } = await run(csrfCheck, {
      respond: () => ({ status: 302, headers: { location: '/tasks/7' } }),
      identities: sessionsOf([MEMBER]),
      authorization,
    });

    expect(outcome.findings).toHaveLength(1);
    expect(outcome.findings[0]).toMatchObject({
      id: 'csrf-post-tasks',
      confidence: 'high',
      severityProposal: 'critical',
      title: 'POST /tasks is accepted without an anti-forgery token',
    });
    expect(requests[0]?.headers).toMatchObject({
      cookie: MEMBER.cookieHeader,
      origin: 'https://qa-audit-untrusted.example.test',
      'content-type': 'application/x-www-form-urlencoded',
    });
  });

  it('is less sure about a plain success page, which could be a form shown again with an error', async () => {
    const { outcome } = await run(csrfCheck, {
      respond: () => ({ status: 200 }),
      identities: sessionsOf([MEMBER]),
      authorization,
    });

    expect(outcome.findings[0]?.confidence).toBe('medium');
  });

  it('is least sure when the authorization gave no request body', async () => {
    const { outcome } = await run(csrfCheck, {
      respond: () => ({ status: 302, headers: { location: '/tasks/7' } }),
      identities: sessionsOf([MEMBER]),
      authorization: { allowedMutations: [{ method: 'POST', path: '/tasks', reason: 'r' }] },
    });

    expect(outcome.findings[0]?.confidence).toBe('low');
  });

  it('passes when the server refuses a complete request that carries no token', async () => {
    const { outcome } = await run(csrfCheck, {
      respond: () => ({ status: 403 }),
      identities: sessionsOf([MEMBER]),
      authorization,
    });

    expect(outcome).toMatchObject({ status: 'passed', findings: [] });
    expect(outcome.note).toBe('Replayed 1 mutation(s) without a token.');
  });

  it('cannot call a refusal a pass when there was no body to make the request valid', async () => {
    const { outcome } = await run(csrfCheck, {
      respond: () => ({ status: 400 }),
      identities: sessionsOf([MEMBER]),
      authorization: { allowedMutations: [{ method: 'POST', path: '/tasks', reason: 'r' }] },
    });

    expect(outcome.status).toBe('uncertain');
    expect(outcome.note).toContain('no request body');
  });

  it.each([
    ['a server error', { status: 500 }],
    ['a redirect to sign in', REDIRECT_TO_LOGIN],
  ])('does not judge %s', async (_label, response) => {
    const { outcome } = await run(csrfCheck, {
      respond: () => response,
      identities: sessionsOf([MEMBER]),
      authorization,
    });

    expect(outcome.status).toBe('uncertain');
    expect(outcome.note).toContain('no clear answer');
  });

  it('does not replay the sign-out path, which would end the identity session for every later check', async () => {
    const { outcome, requests } = await run(csrfCheck, {
      respond: () => ({ status: 403 }),
      identities: sessionsOf([MEMBER]),
      authorization: {
        logoutPath: '/logout',
        allowedMutations: [
          { method: 'POST', path: '/logout', reason: 'Ends the audit identity session' },
          mutation,
        ],
      },
    });

    expect(requests.map((request) => request.path)).toEqual(['/tasks']);
    expect(outcome.note).toBe('Replayed 1 mutation(s) without a token.');
  });

  it('is skipped when the only authorized mutation is signing out', async () => {
    const { outcome, requests } = await run(csrfCheck, {
      respond: () => ({}),
      identities: sessionsOf([MEMBER]),
      authorization: {
        logoutPath: '/logout',
        allowedMutations: [{ method: 'POST', path: '/logout', reason: 'Ends the audit identity session' }],
      },
    });

    expect(outcome.status).toBe('skipped');
    expect(outcome.note).toContain('left to the session check');
    expect(requests).toEqual([]);
  });

  it('is skipped when no mutation is authorized, or no identity is signed in', async () => {
    const none = await run(csrfCheck, { respond: () => ({}), identities: sessionsOf([MEMBER]) });
    const noIdentity = await run(csrfCheck, {
      respond: () => ({}),
      identities: sessionsOf([]),
      authorization,
    });

    expect(none.outcome).toMatchObject({
      status: 'skipped',
      note: expect.stringContaining('no mutation') as unknown,
    });
    expect(noIdentity.outcome).toMatchObject({
      status: 'skipped',
      note: 'The check needs a signed-in identity.',
    });
  });

  it('is blocked when the identity could not sign in', async () => {
    const { outcome } = await run(csrfCheck, {
      respond: () => ({}),
      identities: sessionsOf([], { member: 'sign-in failed' }),
      authorization,
    });

    expect(outcome.status).toBe('blocked');
    expect(outcome.note).toContain('member: sign-in failed');
  });

  it('falls back to any signed-in identity when none has the low role, and omits the content type when none is given', async () => {
    const { requests } = await run(csrfCheck, {
      respond: () => ({ status: 403 }),
      identities: sessionsOf([ADMIN]),
      authorization: { allowedMutations: [{ method: 'POST', path: '/tasks', reason: 'r', body: FORM }] },
    });

    expect(requests[0]?.headers.cookie).toBe(ADMIN.cookieHeader);
    expect(requests[0]?.headers['content-type']).toBeUndefined();
  });
});
