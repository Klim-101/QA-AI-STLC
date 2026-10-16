// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import type { RunResultReport } from '../run-result-report.js';
import { renderRunResultReportMarkdown } from './run-result-report-markdown.js';

const ZERO_COUNTS = { passed: 0, failed: 0, blocked: 0, skipped: 0, uncertain: 0, partial: 0 };
const EMPTY_REPORT: RunResultReport = {
  cases: [],
  caseCounts: undefined,
  specRuns: [],
  accessibility: undefined,
  defects: [],
  approvedRcas: [],
  unapprovedRcaCount: 0,
};

const FULL_REPORT: RunResultReport = {
  cases: [
    {
      testCaseId: 'case-columns',
      testType: 'e2e',
      status: 'passed',
      finishedAt: '2026-10-13T15:06:29.196Z',
      runId: 'run-1',
      resultId: 'result-1',
      evidenceCount: 5,
      resultCount: 1,
    },
    {
      testCaseId: 'case-filter',
      testType: 'e2e',
      status: 'failed',
      finishedAt: '2026-10-13T15:48:59.359Z',
      runId: 'run-2',
      resultId: 'result-2',
      evidenceCount: 11,
      resultCount: 2,
      failureMessage: 'The node list request returned HTTP 500',
    },
    {
      testCaseId: 'case-export',
      testType: 'e2e',
      status: 'blocked',
      finishedAt: '2026-10-13T16:00:00.000Z',
      runId: 'run-2',
      resultId: 'result-3',
      evidenceCount: 0,
      resultCount: 1,
    },
  ],
  caseCounts: { ...ZERO_COUNTS, passed: 1, failed: 1, blocked: 1 },
  specRuns: [
    {
      runId: 'run-spec-1',
      testType: 'e2e',
      startedAt: '2026-10-13T17:00:00.000Z',
      finishedAt: '2026-10-13T17:01:00.000Z',
      specFileCount: 2,
      counts: { ...ZERO_COUNTS, passed: 3, partial: 1 },
    },
  ],
  accessibility: {
    wcagVersion: '2.1',
    level: 'AA',
    scanCount: 2,
    counts: { passed: 4, failed: 1, 'needs-manual-check': 20, 'not-applicable': 3, excepted: 0 },
  },
  defects: [
    {
      id: 'filter-error',
      title: 'Filter returns HTTP 500',
      severityProposal: 'major',
      category: 'api',
      status: 'accepted',
    },
  ],
  approvedRcas: [
    {
      defectId: 'filter-error',
      facts: ['The list request returns 500'],
      hypotheses: [{ description: 'The filter is not escaped', confidence: 'medium' }],
      remediation: ['Escape the filter'],
    },
    {
      defectId: 'other-error',
      facts: ['A fact'],
      hypotheses: [{ description: 'A cause', confidence: 'low' }],
      remediation: [],
    },
  ],
  unapprovedRcaCount: 1,
};

describe('renderRunResultReportMarkdown', () => {
  it('renders every section of a full report', () => {
    expect(renderRunResultReportMarkdown(FULL_REPORT)).toMatchSnapshot();
  });

  it('shows blocked and partial under their own names, never as passed or failed', () => {
    const markdown = renderRunResultReportMarkdown(FULL_REPORT);

    expect(markdown).toContain('| blocked | 1 |');
    expect(markdown).toContain('| case-export | e2e | blocked |');
    expect(markdown).toContain('passed 3, failed 0, blocked 0, skipped 0, uncertain 0, partial 1');
  });

  it('leaves out every section that has nothing to show', () => {
    expect(renderRunResultReportMarkdown(EMPTY_REPORT)).toBe('# Run result report\n');
  });

  it('mentions only the count of RCAs that are not approved', () => {
    const markdown = renderRunResultReportMarkdown({ ...EMPTY_REPORT, unapprovedRcaCount: 2 });

    expect(markdown).toContain('2 root cause analysis(es) not approved are left out.');
    expect(markdown).not.toContain('###');
  });

  it('reports an approved RCA without a remediation or an unapproved-count line', () => {
    const markdown = renderRunResultReportMarkdown({
      ...EMPTY_REPORT,
      approvedRcas: [FULL_REPORT.approvedRcas[1]!],
    });

    expect(markdown).not.toContain('Remediation');
    expect(markdown).not.toContain('not approved');
  });
});
