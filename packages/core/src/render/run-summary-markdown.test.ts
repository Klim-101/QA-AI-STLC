// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { RunRecord } from '@qa-ai-stlc/schemas';
import { expectMatchesGoldenFile } from '@qa-ai-stlc/test-utils/golden-file';
import { describe, expect, it } from 'vitest';
import { renderRunSummaryMarkdown } from './run-summary-markdown.js';

const RUN_RECORD: RunRecord = {
  schemaVersion: 1,
  id: 'run-demo-1',
  testType: 'e2e',
  specFiles: ['tests/login.playwright-spec.ts'],
  baseUrl: 'https://staging.example.test/',
  startedAt: '2026-09-25T10:00:00.000Z',
  finishedAt: '2026-09-25T10:00:05.000Z',
  resultIds: ['run-result-1', 'run-result-2'],
  counts: { passed: 1, failed: 1, blocked: 0, skipped: 0, uncertain: 0, partial: 0 },
};

describe('renderRunSummaryMarkdown', () => {
  it('matches the golden file', async () => {
    await expectMatchesGoldenFile(
      renderRunSummaryMarkdown(RUN_RECORD),
      './__snapshots__/run-summary.golden.md',
    );
  });

  it('includes only statuses declared in "counts", never inventing an extra row', () => {
    const markdown = renderRunSummaryMarkdown(RUN_RECORD);

    expect(markdown).toContain('| passed | 1 |');
    expect(markdown).toContain('| failed | 1 |');
    expect(markdown).toContain('| blocked | 0 |');
  });

  it('ends with a single trailing newline', () => {
    const markdown = renderRunSummaryMarkdown(RUN_RECORD);

    expect(markdown.endsWith('\n')).toBe(true);
    expect(markdown.endsWith('\n\n')).toBe(false);
  });
});
