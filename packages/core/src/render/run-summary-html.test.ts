// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { RunRecord } from '@qa-ai-stlc/schemas';
import { expectMatchesGoldenFile } from '@qa-ai-stlc/test-utils/golden-file';
import { describe, expect, it } from 'vitest';
import { renderRunSummaryHtml } from './run-summary-html.js';

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

describe('renderRunSummaryHtml', () => {
  it('matches the golden file', async () => {
    await expectMatchesGoldenFile(
      renderRunSummaryHtml(RUN_RECORD),
      './__snapshots__/run-summary.golden.html',
    );
  });

  it('escapes HTML-significant characters in a run id', () => {
    const html = renderRunSummaryHtml({ ...RUN_RECORD, id: 'run-<script>' });

    expect(html).toContain('run-&lt;script&gt;');
    expect(html).not.toContain('run-<script>');
  });

  it('is a well-formed standalone document', () => {
    const html = renderRunSummaryHtml(RUN_RECORD);

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html.trim().endsWith('</html>')).toBe(true);
  });
});
