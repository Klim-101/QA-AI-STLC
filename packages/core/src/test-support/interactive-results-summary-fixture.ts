// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { InteractiveResultsSummary } from '../interactive-results-summary.js';

/** Shared by the Markdown and HTML renderer tests so both render the same content. */
export const INTERACTIVE_RESULTS_SUMMARY: InteractiveResultsSummary = {
  rows: [
    {
      testCaseId: 'case-columns',
      testType: 'e2e',
      status: 'passed',
      finishedAt: '2026-10-13T15:06:29.196Z',
      runId: 'run-1',
      evidenceCount: 5,
      resultCount: 1,
    },
    {
      testCaseId: 'case-filter',
      testType: 'e2e',
      status: 'failed',
      finishedAt: '2026-10-13T15:48:59.359Z',
      runId: 'run-2',
      evidenceCount: 11,
      resultCount: 2,
      failureMessage: 'The node list request returned HTTP 500 and the grid was not filtered',
    },
  ],
  counts: { passed: 1, failed: 1, blocked: 0, skipped: 0, uncertain: 0, partial: 0 },
};
