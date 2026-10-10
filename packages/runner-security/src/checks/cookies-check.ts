// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { SecurityFinding } from '@qa-ai-stlc/schemas';
import { looksLikeSessionCookie, parseSetCookie, type CookieFlags } from '../cookie-flags.js';
import { fetchPage } from '../fetch-page.js';
import { buildFinding } from '../finding.js';
import type { SecurityCheck, SecurityCheckOutcome } from '../security-check.js';

// Pages a visitor reaches before signing in. A session cookie is usually set only by a sign-in, so
// this looks at the cookies an anonymous visitor receives; the signed-in pass checks the session.
const PAGE_PATHS: readonly string[] = ['/', '/login'];

interface ObservedCookie {
  readonly flags: CookieFlags;
  readonly requestIndex: number;
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
 * sets for an anonymous visitor. A cookie value is never read into a finding. The attributes are
 * facts about the header, so confidence is high; severity is higher for a cookie whose name looks
 * like a session, because that is the one worth stealing.
 */
export const cookiesCheck: SecurityCheck = {
  checkClass: 'cookies',
  run: async ({ probe, authorization }): Promise<SecurityCheckOutcome> => {
    const { baseUrl } = authorization.environment;
    const isHttps = new URL(baseUrl).protocol === 'https:';
    const observed = new Map<string, ObservedCookie>();
    for (const path of PAGE_PATHS) {
      const page = await fetchPage(probe, baseUrl, path);
      for (const response of page.chain) {
        for (const header of response.setCookies) {
          const flags = parseSetCookie(header);
          if (flags !== undefined) {
            observed.set(flags.name, { flags, requestIndex: response.requestIndex });
          }
        }
      }
    }

    if (observed.size === 0) {
      return {
        status: 'skipped',
        note: 'The application set no cookie for an anonymous visitor; a session cookie is checked once an identity signs in.',
        findings: [],
      };
    }

    const findings: SecurityFinding[] = [];
    for (const { flags, requestIndex } of observed.values()) {
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
            steps: ['Request the page that sets the cookie', 'Read its Set-Cookie header'],
            expectedResult: `The "${flags.name}" cookie carries the ${rule.flag} protection`,
            actualResult: rule.explain(flags.name),
            remediation: rule.remediation,
            regressionCheck: rule.regression,
            requestIndexes: [requestIndex],
          }),
        );
      }
    }
    return {
      status: 'passed',
      note: `Checked ${String(observed.size)} cookie(s) set for an anonymous visitor.`,
      findings,
    };
  },
};
