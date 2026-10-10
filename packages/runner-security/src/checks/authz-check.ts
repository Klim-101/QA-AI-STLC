// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { SecurityFinding } from '@qa-ai-stlc/schemas';
import { fetchPage, type FetchedPage } from '../fetch-page.js';
import { buildFinding } from '../finding.js';
import type { SecurityCheck, SecurityCheckInput, SecurityCheckOutcome } from '../security-check.js';
import { isAccepted, reachedRoute, sessionHeaders } from './session-pages.js';

const BASELINE_PAGE = '/';

function unavailable(input: SecurityCheckInput, whatIsMissing: string): SecurityCheckOutcome {
  const failures = input.identities.describeFailures();
  return failures === undefined
    ? { status: 'skipped', note: whatIsMissing, findings: [] }
    : { status: 'blocked', note: `${whatIsMissing} (${failures})`, findings: [] };
}

/**
 * Asks for each restricted route the authorization names, as the identity that may reach it, as
 * the identity that must not, and with no session at all. A route the privileged identity cannot
 * reach itself cannot be judged and makes the check `uncertain`. Only GET requests are sent.
 * Reaching the route is read as: a 2xx answer on the page that was asked for, not a sign-in page.
 */
export const authzCheck: SecurityCheck = {
  checkClass: 'authz',
  run: async (input): Promise<SecurityCheckOutcome> => {
    const { probe, authorization, identities } = input;
    const { baseUrl } = authorization.environment;
    if (authorization.restrictedRoutes.length === 0) {
      return { status: 'skipped', note: 'The authorization names no restricted route.', findings: [] };
    }
    const low = identities.byRole('low');
    const high = identities.byRole('high');
    if (low === undefined || high === undefined) {
      return unavailable(
        input,
        'The check needs one signed-in identity with role low and one with role high',
      );
    }

    // A refusal only means something if the session was alive to be refused with. A signed-out or
    // expired session is turned away from everything, so without this it would read as a pass.
    const baseline = await fetchPage(probe, baseUrl, BASELINE_PAGE, { headers: sessionHeaders(low) });
    if (!isAccepted(baseline)) {
      return {
        status: 'uncertain',
        note: `The "${low.name}" session was not accepted on ${BASELINE_PAGE}, so a refusal elsewhere would prove nothing.`,
        findings: [],
      };
    }

    const findings: SecurityFinding[] = [];
    const unverified: string[] = [];
    for (const route of authorization.restrictedRoutes) {
      const asHigh = await fetchPage(probe, baseUrl, route, { headers: sessionHeaders(high) });
      if (!reachedRoute(asHigh, route)) {
        unverified.push(route);
        continue;
      }
      const asLow = await fetchPage(probe, baseUrl, route, { headers: sessionHeaders(low) });
      const anonymous = await fetchPage(probe, baseUrl, route);
      if (reachedRoute(asLow, route)) {
        findings.push(finding(route, 'low-privilege', `"${low.name}" (role low)`, asLow, asHigh));
      }
      if (reachedRoute(anonymous, route)) {
        findings.push(finding(route, 'anonymous', 'a visitor who is not signed in', anonymous, asHigh));
      }
    }

    if (findings.length === 0 && unverified.length > 0) {
      return {
        status: 'uncertain',
        note: `The privileged identity could not reach ${unverified.join(', ')}, so access to it could not be judged.`,
        findings,
      };
    }
    return {
      status: 'passed',
      note:
        unverified.length > 0
          ? `Not judged, because the privileged identity could not reach them: ${unverified.join(', ')}.`
          : `Checked ${String(authorization.restrictedRoutes.length)} restricted route(s).`,
      findings,
    };
  },
};

function finding(
  route: string,
  who: 'low-privilege' | 'anonymous',
  description: string,
  actual: FetchedPage,
  privileged: FetchedPage,
): SecurityFinding {
  // The same page for both is conclusive; a different page that is still a 2xx is likely but could
  // be a public variant of the route.
  const isSameContent = actual.response.bodyText === privileged.response.bodyText;
  return buildFinding({
    idParts: ['authz', route, who],
    checkClass: 'authz',
    riskArea: who === 'anonymous' ? 'Access control: authentication' : 'Access control: privilege escalation',
    confidence: isSameContent ? 'high' : 'medium',
    severityProposal: 'critical',
    title:
      who === 'anonymous'
        ? `${route} can be opened without signing in`
        : `${route} can be opened by an identity that should not reach it`,
    steps: [
      `Request ${route} as an identity that is allowed to reach it`,
      `Request ${route} as ${description}`,
      'Compare the two answers',
    ],
    expectedResult: `${route} refuses ${description}, or sends it to sign in`,
    actualResult: `${description} received the page (status ${String(actual.response.status)})${
      isSameContent ? ', identical to what the privileged identity sees' : ''
    }`,
    remediation: `Check the caller's role on the server before serving ${route}, not only in the navigation.`,
    regressionCheck: `Assert that ${route} answers ${description} with 401 or 403, or a redirect to sign in`,
    requestIndexes: [actual.response.requestIndex, privileged.response.requestIndex],
  });
}
