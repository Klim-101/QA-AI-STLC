// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { SecurityAuthorization } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import type { IdentitySessions } from '../identity-sessions.js';
import { SecurityProbe } from '../security-probe.js';
import {
  authorizationFor,
  identitySession,
  scriptedHttpClient,
  sessionsOf,
  type ScriptedRequest,
  type ScriptedResponse,
} from '../test-support/scripted-probe.js';
import { sessionCheck } from './session-check.js';

const BASE_URL = 'http://app.example.test/';
const MEMBER = identitySession('member', 'low');
const REDIRECT_TO_LOGIN: ScriptedResponse = { status: 302, headers: { location: '/login' } };

async function run(options: {
  readonly respond: (request: ScriptedRequest) => ScriptedResponse;
  readonly identities: IdentitySessions;
  readonly authorization?: Partial<SecurityAuthorization>;
}) {
  const { client, requests } = scriptedHttpClient(options.respond);
  const authorization = authorizationFor(BASE_URL, options.authorization);
  const probe = new SecurityProbe({ httpClient: client, authorization, pause: () => Promise.resolve() });
  const outcome = await sessionCheck.run({ probe, authorization, identities: options.identities });
  return { outcome, requests };
}

const AUTHORIZATION: Partial<SecurityAuthorization> = {
  logoutPath: '/logout',
  allowedMutations: [{ method: 'POST', path: '/logout', reason: 'Ends the audit identity session' }],
};

// A signed-in session sees the pages and an anonymous visitor is sent to sign in. After the sign-out
// request a well-behaved server refuses the old cookie too.
function server(options: { readonly invalidates: boolean; readonly isPublic?: boolean }) {
  let signedOut = false;
  return (request: ScriptedRequest): ScriptedResponse => {
    if (request.path === '/logout') {
      signedOut = true;
      return REDIRECT_TO_LOGIN;
    }
    if (request.path === '/login') {
      return { bodyText: 'sign in' };
    }
    if (options.isPublic === true) {
      return { bodyText: 'public' };
    }
    const isSignedIn = request.headers.cookie !== undefined && !(signedOut && options.invalidates);
    return isSignedIn ? { bodyText: 'dashboard' } : REDIRECT_TO_LOGIN;
  };
}

describe('sessionCheck', () => {
  it('reports a session that is still accepted after signing out', async () => {
    const { outcome, requests } = await run({
      respond: server({ invalidates: false }),
      identities: sessionsOf([MEMBER]),
      authorization: AUTHORIZATION,
    });

    expect(outcome.findings).toMatchObject([
      { id: 'session-logout-not-invalidated', severityProposal: 'major', confidence: 'high' },
    ]);
    expect(requests.map((request) => request.path)).toEqual(['/', '/', '/login', '/logout', '/']);
    expect(requests.filter((request) => request.headers.cookie === MEMBER.cookieHeader)).toHaveLength(3);
  });

  it('passes when the old session is refused after signing out', async () => {
    const { outcome } = await run({
      respond: server({ invalidates: true }),
      identities: sessionsOf([MEMBER]),
      authorization: AUTHORIZATION,
    });

    expect(outcome).toMatchObject({
      status: 'passed',
      note: 'The old session was refused on / after signing out.',
      findings: [],
    });
  });

  it('judges on a restricted route that tells signed-in from anonymous', async () => {
    const { requests } = await run({
      respond: server({ invalidates: true }),
      identities: sessionsOf([MEMBER]),
      authorization: { logoutPath: '/logout', restrictedRoutes: ['/dashboard'] },
    });

    // Signing out is a GET unless the authorization lists it as a mutation.
    expect(requests.map((request) => request.path)).toEqual([
      '/dashboard',
      '/dashboard',
      '/login',
      '/logout',
      '/dashboard',
      '/login',
    ]);
  });

  it('falls back to the landing page when the restricted route refuses the signed-in identity too', async () => {
    const inner = server({ invalidates: true });

    const { outcome, requests } = await run({
      respond: (request) => (request.path === '/admin' ? { status: 403 } : inner(request)),
      identities: sessionsOf([MEMBER]),
      authorization: { ...AUTHORIZATION, restrictedRoutes: ['/admin'] },
    });

    expect(outcome.note).toBe('The old session was refused on / after signing out.');
    expect(requests[0]?.path).toBe('/admin');
  });

  it('is uncertain on a site where every page is public: an old cookie working proves nothing', async () => {
    const { outcome, requests } = await run({
      respond: server({ invalidates: false, isPublic: true }),
      identities: sessionsOf([MEMBER]),
      authorization: AUTHORIZATION,
    });

    expect(outcome.status).toBe('uncertain');
    expect(outcome.findings).toEqual([]);
    expect(outcome.note).toContain('No page tells a signed-in visitor from an anonymous one');
    expect(requests.some((request) => request.path === '/logout')).toBe(false);
  });

  it('is uncertain, without signing out, when the session was not accepted anywhere', async () => {
    const { outcome, requests } = await run({
      respond: () => REDIRECT_TO_LOGIN,
      identities: sessionsOf([MEMBER]),
      authorization: AUTHORIZATION,
    });

    expect(outcome.status).toBe('uncertain');
    expect(requests.some((request) => request.path === '/logout')).toBe(false);
  });

  it('is skipped without a sign-out path or a signed-in identity, and blocked when sign-in failed', async () => {
    const noPath = await run({ respond: () => ({}), identities: sessionsOf([MEMBER]) });
    const noIdentity = await run({
      respond: () => ({}),
      identities: sessionsOf([]),
      authorization: AUTHORIZATION,
    });
    const failed = await run({
      respond: () => ({}),
      identities: sessionsOf([], { member: 'sign-in failed' }),
      authorization: AUTHORIZATION,
    });

    expect(noPath.outcome).toMatchObject({
      status: 'skipped',
      note: 'The authorization names no sign-out path.',
    });
    expect(noIdentity.outcome).toMatchObject({
      status: 'skipped',
      note: 'The check needs a signed-in identity.',
    });
    expect(failed.outcome.status).toBe('blocked');
  });
});
