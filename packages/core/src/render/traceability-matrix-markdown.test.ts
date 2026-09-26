// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { expectMatchesGoldenFile } from '@qa-ai-stlc/test-utils/golden-file';
import { describe, expect, it } from 'vitest';
import type { TraceabilityMatrix } from '../traceability.js';
import { renderTraceabilityMatrixMarkdown } from './traceability-matrix-markdown.js';

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
          flaky: false,
        },
        {
          testCaseId: 'case-2',
          title: 'Invalid credentials are rejected',
          latestResult: undefined,
          flaky: false,
        },
      ],
    },
    { requirementId: 'req-2', title: 'A locked account cannot log in', cases: [] },
  ],
};

describe('renderTraceabilityMatrixMarkdown', () => {
  it('matches the golden file', async () => {
    await expectMatchesGoldenFile(
      renderTraceabilityMatrixMarkdown(MATRIX),
      './__snapshots__/traceability-matrix.golden.md',
    );
  });

  it('reports a case with no result as "never run" rather than a blank cell', () => {
    const markdown = renderTraceabilityMatrixMarkdown(MATRIX);

    expect(markdown).toContain('Invalid credentials are rejected (case-2) | never run |');
  });

  it('flags a requirement with no linked cases as a real coverage gap', () => {
    const markdown = renderTraceabilityMatrixMarkdown(MATRIX);

    expect(markdown).toContain('## A locked account cannot log in (req-2)');
    expect(markdown).toContain('No linked test cases.');
  });

  it('renders "no" for a stable case', () => {
    const markdown = renderTraceabilityMatrixMarkdown(MATRIX);

    expect(markdown).toContain('Valid credentials log in (case-1) | passed | result-1 | 0 | no |');
  });

  it('renders "yes" for a flaky case', () => {
    const markdown = renderTraceabilityMatrixMarkdown({
      generatedAt: '2026-09-25T10:00:00.000Z',
      requirements: [
        {
          requirementId: 'req-1',
          title: 'A registered user can log in',
          cases: [{ testCaseId: 'case-1', title: 'Flaky login case', latestResult: undefined, flaky: true }],
        },
      ],
    });

    expect(markdown).toContain('Flaky login case (case-1) | never run | — | 0 | yes |');
  });

  it('reports zero requirements without crashing', () => {
    const markdown = renderTraceabilityMatrixMarkdown({
      generatedAt: '2026-09-25T10:00:00.000Z',
      requirements: [],
    });

    expect(markdown).toContain('No requirements recorded yet.');
  });
});
