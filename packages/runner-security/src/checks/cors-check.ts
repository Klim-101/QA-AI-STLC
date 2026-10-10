// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { SecurityFinding } from '@qa-ai-stlc/schemas';
import { fetchPage } from '../fetch-page.js';
import { buildFinding } from '../finding.js';
import type { SecurityCheck, SecurityCheckOutcome } from '../security-check.js';

const PAGE_PATH = '/';

// Origins the application has no reason to trust. `.test` is reserved (RFC 6761) and `null` is what
// sandboxed documents send, so neither can be a real caller of this application.
const FOREIGN_ORIGINS: readonly string[] = ['https://qa-audit-untrusted.example.test', 'null'];

/**
 * Sends the landing page request with a foreign `Origin` and reads the CORS answer. Allowing the
 * foreign origin together with credentials lets any site read signed-in responses, which is the
 * serious case; allowing it without credentials only exposes what an anonymous visitor sees.
 * `Access-Control-Allow-Origin: *` is not reported: it is the normal setting of a public resource,
 * and browsers refuse it together with credentials.
 */
export const corsCheck: SecurityCheck = {
  checkClass: 'cors',
  run: async ({ probe, authorization }): Promise<SecurityCheckOutcome> => {
    const { baseUrl } = authorization.environment;
    const findings: SecurityFinding[] = [];

    for (const origin of FOREIGN_ORIGINS) {
      const page = await fetchPage(probe, baseUrl, PAGE_PATH, { headers: { origin } });
      const { headers } = page.response;
      if (headers['access-control-allow-origin'] !== origin) {
        continue;
      }
      const hasCredentials = headers['access-control-allow-credentials']?.toLowerCase() === 'true';
      findings.push(
        buildFinding({
          idParts: [
            'cors',
            origin === 'null' ? 'null-origin' : 'reflected-origin',
            hasCredentials ? 'credentials' : 'anonymous',
          ],
          checkClass: 'cors',
          riskArea: 'Cross-origin access',
          confidence: 'high',
          severityProposal: hasCredentials ? 'major' : 'minor',
          title: hasCredentials
            ? `Any origin is allowed to read responses with credentials ("${origin}")`
            : `An untrusted origin is allowed to read responses ("${origin}")`,
          steps: [
            `Request ${PAGE_PATH} with the header Origin: ${origin}`,
            'Read the Access-Control-Allow-* headers',
          ],
          expectedResult: 'The response does not allow an origin the application has no reason to trust',
          actualResult: `The response allowed "${origin}"${
            hasCredentials ? ' and sent Access-Control-Allow-Credentials: true' : ''
          }`,
          remediation:
            'Allow only an explicit list of trusted origins; never reflect the request Origin, and never combine it with credentials.',
          regressionCheck: `Assert that a request with Origin: ${origin} gets no Access-Control-Allow-Origin for that origin`,
          requestIndexes: [page.response.requestIndex],
        }),
      );
    }
    return { status: 'passed', note: 'Tried a foreign origin and the null origin.', findings };
  },
};
