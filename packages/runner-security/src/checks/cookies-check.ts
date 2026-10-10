// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { SecurityFinding } from '@qa-ai-stlc/schemas';
import { looksLikeSessionCookie, parseSetCookie, type CookieFlags } from '../cookie-flags.js';
import { fetchPage } from '../fetch-page.js';
import { buildFinding } from '../finding.js';
import type { SecurityCheck, SecurityCheckOutcome } from '../security-check.js';

// Pages a visitor reaches before signing in. A session cookie is usually set only by a sign-in, so
// the cookies an anonymous visitor receives are checked here and the ones a signed-in identity's
// browser session holds are checked from its saved state.
const PAGE_PATHS: readonly string[] = ['/', '/login'];

interface ObservedCookie {
  readonly flags: CookieFlags;
  /** The request that set it; absent for a cookie read from a signed-in identity's browser session. */
  readonly requestIndex: number | undefined;
  /** Who held it: anonymous visitors, or the identity whose session carries it. */
  readonly holder: string;
}

interface CookieRule {
  readonly flag: string;
  readonly isViolated: (cookie: CookieFlags, isHttps: boolean) => boolean;
  readonly explain: (name: string) => string;
  readonly remediation: string;
  readonly regression: string;
}

const RULES: readonly CookieRule[] = [
  {
    flag: 'httponly',
    isViolated: (cookie) => !cookie.isHttpOnly,
    explain: (name) => `The "${name}" cookie can be read by scripts running in the page`,
    remediation: 'Set HttpOnly on the cookie.',
    regression: 'Assert that the Set-Cookie header of the cookie contains HttpOnly',
  },
  {
    flag: 'secure',
    isViolated: (cookie, isHttps) => isHttps && !cookie.isSecure,
    explain: (name) => `The "${name}" cookie can be sent over an unencrypted connection`,
    remediation: 'Set Secure on the cookie.',
    regression: 'Assert that the Set-Cookie header of the cookie contains Secure',
  },
  {
    flag: 'samesite',
    isViolated: (cookie) => cookie.sameSite === undefined || cookie.sameSite === 'none',
    explain: (name) => `The "${name}" cookie is sent on cross-site requests`,
    remediation: 'Set SameSite=Lax, or Strict where the application allows it.',
    regression: 'Assert that the Set-Cookie header of the cookie names SameSite=Lax or Strict',
  },
];

/**
 * Checks the protective attributes (HttpOnly, Secure, SameSite) of every cookie the application
 * sets for an anonymous visitor and of every cookie a signed-in identity's session holds, which
 * is where a session cookie shows up. A cookie value is never read into a finding. The attributes are
 * facts about the header, so confidence is high; severity is higher for a cookie whose name looks
 * like a session, because that is the one worth stealing.
 */
export const cookiesCheck: SecurityCheck = {
  checkClass: 'cookies',
  run: async ({ probe, authorization, identities }): Promise<SecurityCheckOutcome> => {
    const { baseUrl } = authorization.environment;
    const isHttps = new URL(baseUrl).protocol === 'https:';
    const observed = new Map<string, ObservedCookie>();
    for (const path of PAGE_PATHS) {
      const page = await fetchPage(probe, baseUrl, path);
      for (const response of page.chain) {
        for (const header of response.setCookies) {
          const flags = parseSetCookie(header);
          if (flags !== undefined) {
            observed.set(flags.name, {
              flags,
              requestIndex: response.requestIndex,
              holder: 'anonymous visitors',
            });
          }
        }
      }
    }

    for (const session of identities.all()) {
      for (const flags of session.cookies) {
        observed.set(flags.name, {
          flags,
          requestIndex: undefined,
          holder: `the signed-in identity "${session.name}"`,
        });
      }
    }
    const failures = identities.describeFailures();

    if (observed.size === 0) {
      return failures === undefined
        ? {
            status: 'skipped',
            note: 'The application set no cookie for an anonymous visitor and no identity was signed in to hold a session cookie.',
            findings: [],
          }
        : {
            status: 'blocked',
            note: `No cookie was seen, and an identity could not sign in (${failures})`,
            findings: [],
          };
    }

    const findings: SecurityFinding[] = [];
    for (const { flags, requestIndex, holder } of observed.values()) {
      const isSession = looksLikeSessionCookie(flags.name);
      for (const rule of RULES.filter((candidate) => candidate.isViolated(flags, isHttps))) {
        findings.push(
          buildFinding({
            idParts: ['cookies', flags.name, rule.flag],
            checkClass: 'cookies',
            riskArea: 'Session management',
            confidence: 'high',
            severityProposal: isSession && rule.flag !== 'samesite' ? 'major' : 'minor',
            title: `The "${flags.name}" cookie lacks ${rule.flag === 'samesite' ? 'a SameSite policy' : rule.flag === 'httponly' ? 'HttpOnly' : 'Secure'}`,
            steps:
              requestIndex === undefined
                ? [`Sign in as ${holder}`, 'Read the attributes of the cookies the browser session holds']
                : ['Request the page that sets the cookie', 'Read its Set-Cookie header'],
            expectedResult: `The "${flags.name}" cookie carries the ${rule.flag} protection`,
            actualResult: rule.explain(flags.name),
            remediation: rule.remediation,
            regressionCheck: rule.regression,
            requestIndexes: requestIndex === undefined ? [] : [requestIndex],
          }),
        );
      }
    }
    const note = `Checked ${String(observed.size)} cookie(s) held by anonymous visitors and signed-in identities.`;
    if (failures !== undefined && findings.length === 0) {
      return { status: 'uncertain', note: `${note} An identity could not sign in (${failures}).`, findings };
    }
    return { status: 'passed', note, findings };
  },
};
