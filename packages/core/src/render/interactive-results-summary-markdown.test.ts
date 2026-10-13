// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { expectMatchesGoldenFile } from '@qa-ai-stlc/test-utils/golden-file';
import { describe, expect, it } from 'vitest';
import { INTERACTIVE_RESULTS_SUMMARY as SUMMARY } from '../test-support/interactive-results-summary-fixture.js';
import { renderInteractiveResultsSummaryMarkdown } from './interactive-results-summary-markdown.js';

describe('renderInteractiveResultsSummaryMarkdown', () => {
  it('matches the golden file', async () => {
    await expectMatchesGoldenFile(
      renderInteractiveResultsSummaryMarkdown(SUMMARY),
      './__snapshots__/interactive-results-summary.golden.md',
    );
  });

  it('names the run when the summary is narrowed to one', () => {
    const markdown = renderInteractiveResultsSummaryMarkdown({ ...SUMMARY, runId: 'run-2' });

    expect(markdown).toContain('# Live execution results: run-2');
  });

  it('leaves out the failures section when no latest result failed with a message', () => {
    const markdown = renderInteractiveResultsSummaryMarkdown({
      ...SUMMARY,
      rows: SUMMARY.rows.slice(0, 1),
    });

    expect(markdown).not.toContain('## Failures');
  });

  it('states that the results did not come from qa run', () => {
    expect(renderInteractiveResultsSummaryMarkdown(SUMMARY)).toContain('not by `qa run`');
  });
});
