// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { fetchPage } from '../fetch-page.js';
import { buildFinding } from '../finding.js';
import type { SecurityCheck, SecurityCheckOutcome } from '../security-check.js';
import { isAccepted, sessionHeaders } from './session-pages.js';

const DEFAULT_PAGE = '/';

/**
 * Checks that signing out ends the session on the server. With a signed-in identity it confirms
 * the session works, signs out through the path the authorization names, then replays the old
 * session cookie: a page that still opens means the session outlives its sign-out and a stolen
 * cookie stays usable. Sign-out is a POST only if the authorization lists it as a mutation, a GET
 * otherwise. This ends the identity's session, so it runs after the checks that use it.
 */
export const sessionCheck: SecurityCheck = {
  checkClass: 'session',
  run: async ({ probe, authorization, identities }): Promise<SecurityCheckOutcome> => {
    const { logoutPath, restrictedRoutes } = authorization;
    if (logoutPath === undefined) {
      return { status: 'skipped', note: 'The authorization names no sign-out path.', findings: [] };
    }
    const session = identities.byRole('low') ?? identities.all()[0];
    if (session === undefined) {
      const failures = identities.describeFailures();
      return failures === undefined
        ? { status: 'skipped', note: 'The check needs a signed-in identity.', findings: [] }
        : { status: 'blocked', note: `The check needs a signed-in identity (${failures})`, findings: [] };
    }

    const { baseUrl } = authorization.environment;
    const headers = sessionHeaders(session);
    // Only a page that a signed-in visitor opens and an anonymous one does not can show whether the
    // session still counts; on a public page an old cookie would "still work" with no flaw at all.
    let indicator: { readonly page: string; readonly firstResponseIndex: number } | undefined;
    for (const candidate of [...restrictedRoutes, DEFAULT_PAGE]) {
      const signedIn = await fetchPage(probe, baseUrl, candidate, { headers });
      if (!isAccepted(signedIn)) {
        continue;
      }
      const anonymous = await fetchPage(probe, baseUrl, candidate);
      if (!isAccepted(anonymous)) {
        indicator = { page: candidate, firstResponseIndex: signedIn.response.requestIndex };
        break;
      }
    }
    if (indicator === undefined) {
      return {
        status: 'uncertain',
        note: 'No page tells a signed-in visitor from an anonymous one, so the end of the session could not be judged.',
        findings: [],
      };
    }
    const { page, firstResponseIndex } = indicator;

    const method =
      authorization.allowedMutations.find((mutation) => mutation.path === logoutPath)?.method ?? 'GET';
    const signOut = await probe.request({ method, path: logoutPath, headers });
    const after = await fetchPage(probe, baseUrl, page, { headers });
    if (!isAccepted(after)) {
      return {
        status: 'passed',
        note: `The old session was refused on ${page} after signing out.`,
        findings: [],
      };
    }

    return {
      status: 'passed',
      findings: [
        buildFinding({
          idParts: ['session', 'logout-not-invalidated'],
          checkClass: 'session',
          riskArea: 'Session management',
          confidence: 'high',
          severityProposal: 'major',
          title: 'A session stays valid after signing out',
          steps: [
            `Sign in and open ${page}`,
            `Sign out with ${method} ${logoutPath}`,
            `Open ${page} again with the session cookie from before signing out`,
          ],
          expectedResult: 'The old session cookie is refused or sent to sign in',
          actualResult: `${page} still answered ${String(after.response.status)} for the old session`,
          remediation: 'End the session on the server when the user signs out, not only in the browser.',
          regressionCheck: `Assert that a session cookie from before ${logoutPath} is refused afterwards`,
          requestIndexes: [firstResponseIndex, signOut.requestIndex, after.response.requestIndex],
        }),
      ],
    };
  },
};
