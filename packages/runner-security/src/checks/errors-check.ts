// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { SecurityFinding } from '@qa-ai-stlc/schemas';
import { buildFinding } from '../finding.js';
import type { SecurityCheck, SecurityCheckOutcome } from '../security-check.js';

// A path nothing serves, and a path with an invalid percent escape: the two ordinary ways to
// provoke an error page without sending anything harmful.
const ERROR_PATHS: readonly { readonly path: string; readonly label: string }[] = [
  { path: '/qa-audit-no-such-page', label: 'a page that does not exist' },
  { path: '/qa-audit-%ZZ', label: 'a malformed percent escape' },
];

interface LeakPattern {
  readonly name: string;
  readonly pattern: RegExp;
  readonly severity: SecurityFinding['severityProposal'];
}

// What an error page should never print: where the code lives, which query failed, which product
// and version is answering. Each pattern matches wording specific enough to be rare in ordinary prose.
const LEAK_PATTERNS: readonly LeakPattern[] = [
  {
    name: 'stack-trace',
    pattern:
      /\n\s+at [\w$.<>[\] ]+\(?[^\n)]*:\d+:\d+\)?|Traceback \(most recent call last\)|Stack trace:|Exception in thread/u,
    severity: 'major',
  },
  {
    name: 'database-error',
    pattern:
      /SQLSTATE\[|ORA-\d{5}|You have an error in your SQL syntax|PG::\w+Error|SQLite3?::|MongoServerError/iu,
    severity: 'major',
  },
  {
    name: 'framework-banner',
    pattern:
      /Whitelabel Error Page|Server Error in '\/' Application|Werkzeug Debugger|Django.*DEBUG = True|Laravel.*Whoops|<pre>Cannot (GET|POST|PUT|DELETE) \//iu,
    severity: 'trivial',
  },
];

/**
 * Provokes two ordinary error responses and reads them for stack traces, database errors and
 * framework banners. A match is something the page printed, so confidence is high; it is only a
 * response body, so nothing here changes anything on the server.
 */
export const errorsCheck: SecurityCheck = {
  checkClass: 'errors',
  run: async ({ probe }): Promise<SecurityCheckOutcome> => {
    const findings: SecurityFinding[] = [];
    for (const { path, label } of ERROR_PATHS) {
      const response = await probe.request({ method: 'GET', path });
      for (const leak of LEAK_PATTERNS.filter((candidate) => candidate.pattern.test(response.bodyText))) {
        findings.push(
          buildFinding({
            idParts: ['errors', leak.name, path],
            checkClass: 'errors',
            riskArea: 'Information disclosure: error pages',
            confidence: 'high',
            severityProposal: leak.severity,
            title: `An error page discloses a ${leak.name.replace('-', ' ')}`,
            steps: [`Request ${path} (${label})`, 'Read the response body'],
            expectedResult:
              'The error page says what went wrong for a visitor and nothing about the implementation',
            actualResult: `GET ${path} answered ${String(response.status)} with a ${leak.name.replace('-', ' ')}`,
            remediation: 'Show a generic error page in production and log the detail on the server.',
            regressionCheck: `Assert that GET ${path} returns no ${leak.name.replace('-', ' ')}`,
            requestIndexes: [response.requestIndex],
          }),
        );
      }
    }
    return { status: 'passed', note: 'Provoked a missing-page and a malformed-escape error.', findings };
  },
};
