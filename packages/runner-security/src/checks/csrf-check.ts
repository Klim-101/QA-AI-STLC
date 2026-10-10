// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { SecurityAllowedMutation, SecurityFinding } from '@qa-ai-stlc/schemas';
import { buildFinding } from '../finding.js';
import type { SecurityCheck, SecurityCheckOutcome } from '../security-check.js';
import type { ProbeResponse } from '../security-probe.js';
import { isSignInLocation, sessionHeaders } from './session-pages.js';

// What a forged request looks like to the server: from a site it has no reason to trust.
const FOREIGN_ORIGIN = 'https://qa-audit-untrusted.example.test';

type Verdict = 'accepted' | 'rejected' | 'unclear';

function judge(response: ProbeResponse): Verdict {
  const { status } = response;
  if (status >= 200 && status < 300) {
    return 'accepted';
  }
  if (status >= 300 && status < 400) {
    return isSignInLocation(response.headers.location) ? 'unclear' : 'accepted';
  }
  return status >= 400 && status < 500 ? 'rejected' : 'unclear';
}

/**
 * Replays each mutation the authorization names with a valid session, a foreign `Origin`, and no
 * anti-forgery token. A server that checks for forgery refuses it. Only the mutations the
 * operator named can be sent (the probe enforces it), and a complete request body the operator
 * vouched for is what makes a refusal mean something: an empty body is refused for reasons that
 * have nothing to do with CSRF, so without a body a refusal is `uncertain`, not `passed`.
 */
export const csrfCheck: SecurityCheck = {
  checkClass: 'csrf',
  run: async ({ probe, authorization, identities }): Promise<SecurityCheckOutcome> => {
    // Signing out is the session check's job. Replaying it here would end the identity's session
    // and make every later check read a dead session as a refusal.
    const mutations = authorization.allowedMutations.filter(
      (mutation) => mutation.path !== authorization.logoutPath,
    );
    if (mutations.length === 0) {
      return {
        status: 'skipped',
        note: 'The authorization names no mutation to replay without a token (the sign-out path is left to the session check).',
        findings: [],
      };
    }
    const session = identities.byRole('low') ?? identities.all()[0];
    if (session === undefined) {
      const failures = identities.describeFailures();
      return failures === undefined
        ? { status: 'skipped', note: 'The check needs a signed-in identity.', findings: [] }
        : { status: 'blocked', note: `The check needs a signed-in identity (${failures})`, findings: [] };
    }

    const findings: SecurityFinding[] = [];
    let unclear = 0;
    let unverifiedRefusals = 0;
    for (const mutation of mutations) {
      const response = await probe.request({
        method: mutation.method,
        path: mutation.path,
        headers: {
          ...sessionHeaders(session),
          origin: FOREIGN_ORIGIN,
          referer: `${FOREIGN_ORIGIN}/`,
          ...(mutation.contentType !== undefined ? { 'content-type': mutation.contentType } : {}),
        },
        ...(mutation.body !== undefined ? { body: mutation.body } : {}),
      });
      const verdict = judge(response);
      if (verdict === 'accepted') {
        findings.push(acceptedFinding(mutation, response));
      } else if (verdict === 'unclear') {
        unclear += 1;
      } else if (mutation.body === undefined) {
        unverifiedRefusals += 1;
      }
    }

    if (findings.length > 0 || (unclear === 0 && unverifiedRefusals === 0)) {
      return {
        status: 'passed',
        note: `Replayed ${String(mutations.length)} mutation(s) without a token.`,
        findings,
      };
    }
    return {
      status: 'uncertain',
      note:
        unclear > 0
          ? 'A replayed request got no clear answer (a server error, or a redirect to sign in), so it was not judged.'
          : 'The authorization gave no request body, so a refusal may have another cause than the missing token.',
      findings,
    };
  },
};

function acceptedFinding(mutation: SecurityAllowedMutation, response: ProbeResponse): SecurityFinding {
  const isRedirect = response.status >= 300;
  return buildFinding({
    idParts: ['csrf', mutation.method, mutation.path],
    checkClass: 'csrf',
    riskArea: 'Request forgery',
    // A redirect away from a sign-in page after a full request is a clear acceptance; a 200 can be
    // a form re-displayed with an error, and a request without a body proves less still.
    confidence: mutation.body === undefined ? 'low' : isRedirect ? 'high' : 'medium',
    severityProposal: 'critical',
    title: `${mutation.method} ${mutation.path} is accepted without an anti-forgery token`,
    steps: [
      'Sign in as an identity',
      `Send ${mutation.method} ${mutation.path} with the session cookie, a foreign Origin and no token`,
    ],
    expectedResult: 'The server refuses a state-changing request that carries no valid anti-forgery token',
    actualResult: `The server answered ${String(response.status)}${isRedirect ? ' with a redirect to the next page' : ''} and accepted it`,
    remediation:
      'Verify a per-session anti-forgery token (or an Origin check, or SameSite cookies as a second layer) on every state-changing route.',
    regressionCheck: `Assert that ${mutation.method} ${mutation.path} without a token answers 403 or 400`,
    requestIndexes: [response.requestIndex],
  });
}
