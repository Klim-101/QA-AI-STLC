// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { SecurityFinding } from '@qa-ai-stlc/schemas';
import { fetchPage } from '../fetch-page.js';
import { buildFinding } from '../finding.js';
import type { SecurityCheck, SecurityCheckOutcome } from '../security-check.js';

const PAGE_PATH = '/';

// A product name followed by a version number tells an attacker which known flaws to try.
const VERSIONED_BANNER = /\d+\.\d+/u;

interface HeaderExpectation {
  readonly name: string;
  readonly isMissing: (headers: Readonly<Record<string, string>>, isHttps: boolean) => boolean;
  readonly title: string;
  readonly riskArea: string;
  readonly severity: SecurityFinding['severityProposal'];
  readonly expected: string;
  readonly remediation: string;
}

const EXPECTATIONS: readonly HeaderExpectation[] = [
  {
    name: 'content-security-policy',
    isMissing: (headers) => headers['content-security-policy'] === undefined,
    title: 'No Content-Security-Policy header',
    riskArea: 'Browser hardening: script injection',
    severity: 'minor',
    expected: 'The response sets a Content-Security-Policy that limits where scripts can load from',
    remediation: 'Send a Content-Security-Policy header, starting from a restrictive default-src.',
  },
  {
    name: 'x-content-type-options',
    isMissing: (headers) => headers['x-content-type-options']?.toLowerCase() !== 'nosniff',
    title: 'Content type sniffing is not disabled',
    riskArea: 'Browser hardening: content sniffing',
    severity: 'minor',
    expected: 'The response sets X-Content-Type-Options: nosniff',
    remediation: 'Send X-Content-Type-Options: nosniff on every response.',
  },
  {
    name: 'framing',
    // A frame-ancestors directive in the CSP supersedes X-Frame-Options, so either one counts.
    isMissing: (headers) =>
      headers['x-frame-options'] === undefined &&
      !(headers['content-security-policy'] ?? '').toLowerCase().includes('frame-ancestors'),
    title: 'The page can be framed by any site',
    riskArea: 'Browser hardening: clickjacking',
    severity: 'minor',
    expected: 'The response sets X-Frame-Options or a CSP frame-ancestors directive',
    remediation: "Send Content-Security-Policy: frame-ancestors 'self', or X-Frame-Options: SAMEORIGIN.",
  },
  {
    name: 'strict-transport-security',
    isMissing: (headers, isHttps) => isHttps && headers['strict-transport-security'] === undefined,
    title: 'No Strict-Transport-Security header on an HTTPS site',
    riskArea: 'Transport security',
    severity: 'minor',
    expected: 'The HTTPS response sets Strict-Transport-Security',
    remediation: 'Send Strict-Transport-Security with a max-age of at least six months.',
  },
  {
    name: 'referrer-policy',
    isMissing: (headers) => headers['referrer-policy'] === undefined,
    title: 'No Referrer-Policy header',
    riskArea: 'Information disclosure: referrer',
    severity: 'trivial',
    expected: 'The response sets a Referrer-Policy',
    remediation: 'Send Referrer-Policy: strict-origin-when-cross-origin or stricter.',
  },
];

/**
 * Looks at the security headers of the landing page, following same-origin redirects to the page
 * a visitor actually sees. Header names are compared case-insensitively because the probe's HTTP
 * client lower-cases them. A missing header is a fact about the response, so those findings carry
 * high confidence; their severity stays low because each is defence in depth, not a flaw by itself.
 */
export const headersCheck: SecurityCheck = {
  checkClass: 'headers',
  run: async ({ probe, authorization }): Promise<SecurityCheckOutcome> => {
    const { baseUrl } = authorization.environment;
    const isHttps = new URL(baseUrl).protocol === 'https:';
    const page = await fetchPage(probe, baseUrl, PAGE_PATH);
    const { headers } = page.response;
    const requestIndexes = [page.response.requestIndex];
    const reached = `GET ${page.path}`;

    const findings: SecurityFinding[] = EXPECTATIONS.filter((expectation) =>
      expectation.isMissing(headers, isHttps),
    ).map((expectation) =>
      buildFinding({
        idParts: ['headers', expectation.name],
        checkClass: 'headers',
        riskArea: expectation.riskArea,
        confidence: 'high',
        severityProposal: expectation.severity,
        title: expectation.title,
        steps: [
          `Request ${PAGE_PATH}${page.path === PAGE_PATH ? '' : ` and follow it to ${page.path}`}`,
          'Read the response headers',
        ],
        expectedResult: expectation.expected,
        actualResult: `${reached} answered ${String(page.response.status)} without it`,
        remediation: expectation.remediation,
        regressionCheck: `Assert that ${reached} returns the ${expectation.name} protection`,
        requestIndexes,
      }),
    );

    const banners = [headers.server, headers['x-powered-by']].filter(
      (value): value is string => value !== undefined,
    );
    const disclosesTechnology =
      headers['x-powered-by'] !== undefined || banners.some((banner) => VERSIONED_BANNER.test(banner));
    if (disclosesTechnology) {
      findings.push(
        buildFinding({
          idParts: ['headers', 'technology-banner'],
          checkClass: 'headers',
          riskArea: 'Information disclosure: technology',
          confidence: 'medium',
          severityProposal: 'trivial',
          title: 'The response names the server technology',
          steps: [`Request ${PAGE_PATH}`, 'Read the Server and X-Powered-By headers'],
          expectedResult: 'The response does not name the framework or its version',
          actualResult: `The response sent ${banners.map((banner) => `"${banner}"`).join(' and ')}`,
          remediation: 'Remove X-Powered-By and drop version numbers from the Server header.',
          regressionCheck:
            'Assert that the response has no X-Powered-By header and no versioned Server header',
          requestIndexes,
        }),
      );
    }

    return { status: 'passed', note: `Read the headers of ${page.path}.`, findings };
  },
};
