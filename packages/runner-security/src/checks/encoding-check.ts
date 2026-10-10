// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { SecurityFinding } from '@qa-ai-stlc/schemas';
import { fetchPage } from '../fetch-page.js';
import { buildFinding } from '../finding.js';
import type { SecurityCheck, SecurityCheckOutcome } from '../security-check.js';

const PAGE_PATHS: readonly string[] = ['/', '/login'];

// Query parameter names that applications commonly echo into a page. A black-box check cannot know
// which parameters an application reads, so it can only try the usual ones.
const PARAMETER_NAMES: readonly string[] = [
  'q',
  'search',
  'query',
  's',
  'name',
  'id',
  'message',
  'error',
  'redirect',
  'next',
];

// A marker, not a payload: it contains the characters that matter in HTML (angle brackets and
// quotes) around a fixed token, and does nothing if it is reflected.
const TOKEN = 'qaaudit7q3';
const MARKER = `${TOKEN}<"'>`;

/**
 * Sends a harmless marker in the usual query parameters and reads the page back. A marker that
 * comes back with its angle brackets and quotes unencoded means input is written into the page
 * without encoding, the precondition of cross-site scripting. Only GET requests are sent. Finding
 * nothing proves little (the real parameters stay unknown), so a clean result is `uncertain`, not
 * `passed`: the audit does not claim more than it tried.
 */
export const encodingCheck: SecurityCheck = {
  checkClass: 'encoding',
  run: async ({ probe, authorization }): Promise<SecurityCheckOutcome> => {
    const { baseUrl } = authorization.environment;
    const query = PARAMETER_NAMES.map((name) => `${name}=${encodeURIComponent(MARKER)}`).join('&');
    const findings: SecurityFinding[] = [];

    for (const path of PAGE_PATHS) {
      const page = await fetchPage(probe, baseUrl, `${path}?${query}`);
      if (!page.response.bodyText.includes(MARKER)) {
        continue;
      }
      findings.push(
        buildFinding({
          idParts: ['encoding', 'reflected', path],
          checkClass: 'encoding',
          riskArea: 'Injection: output encoding',
          confidence: 'medium',
          severityProposal: 'major',
          title: `Input from the query string is written into ${path} without encoding`,
          steps: [
            `Request ${path} with a marker containing angle brackets and quotes in the usual parameters`,
            'Search the page for the marker, unencoded',
          ],
          expectedResult: 'Characters that are special in HTML come back encoded',
          actualResult: `The marker was returned unencoded by GET ${page.path.replace(/\?.*$/u, '')}`,
          remediation: 'Encode all input for the context it is written into (HTML, attribute, script, URL).',
          regressionCheck: `Assert that a marker with angle brackets sent to ${path} is returned encoded`,
          requestIndexes: [page.response.requestIndex],
        }),
      );
    }
    return {
      status: 'uncertain',
      note: `Tried ${String(PARAMETER_NAMES.length)} common parameter names on ${String(PAGE_PATHS.length)} pages; parameters the application actually reads were not discovered.`,
      findings,
    };
  },
};
