// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { expectMatchesGoldenFile } from '@qa-ai-stlc/test-utils/golden-file';
import { describe, expect, it } from 'vitest';
import type { TraceabilityMatrix } from '../traceability.js';
import { renderTraceabilityMatrixHtml } from './traceability-matrix-html.js';

const MATRIX: TraceabilityMatrix = {
  generatedAt: '2026-09-25T10:00:00.000Z',
  requirements: [
    {
      requirementId: 'req-1',
      title: 'A registered user can log in',
      cases: [
        {
          testCaseId: 'case-1',
          title: 'Valid credentials log in',
          latestResult: {
            resultId: 'result-1',
            runId: 'run-1',
            status: 'passed',
            finishedAt: '2026-09-25T10:00:05.000Z',
            evidenceIds: [],
          },
        },
        { testCaseId: 'case-2', title: 'Invalid credentials are rejected', latestResult: undefined },
      ],
    },
    { requirementId: 'req-2', title: 'A locked account cannot log in', cases: [] },
  ],
};

describe('renderTraceabilityMatrixHtml', () => {
  it('matches the golden file', async () => {
    await expectMatchesGoldenFile(
      renderTraceabilityMatrixHtml(MATRIX),
      './__snapshots__/traceability-matrix.golden.html',
    );
  });

  it('escapes HTML-significant characters in a requirement title', () => {
    const html = renderTraceabilityMatrixHtml({
      generatedAt: '2026-09-25T10:00:00.000Z',
      requirements: [{ requirementId: 'req-1', title: '<script>alert(1)</script>', cases: [] }],
    });

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('reports a case with no result as "never run" rather than a blank cell', () => {
    const html = renderTraceabilityMatrixHtml(MATRIX);

    expect(html).toContain('<td>Invalid credentials are rejected (case-2)</td><td>never run</td>');
  });

  it('reports zero requirements without crashing', () => {
    const html = renderTraceabilityMatrixHtml({ generatedAt: '2026-09-25T10:00:00.000Z', requirements: [] });

    expect(html).toContain('No requirements recorded yet.');
  });
});
