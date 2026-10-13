// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { expectMatchesGoldenFile } from '@qa-ai-stlc/test-utils/golden-file';
import { describe, expect, it } from 'vitest';
import { INTERACTIVE_RESULTS_SUMMARY as SUMMARY } from '../test-support/interactive-results-summary-fixture.js';
import { renderInteractiveResultsSummaryHtml } from './interactive-results-summary-html.js';

describe('renderInteractiveResultsSummaryHtml', () => {
  it('matches the golden file', async () => {
    await expectMatchesGoldenFile(
      renderInteractiveResultsSummaryHtml(SUMMARY),
      './__snapshots__/interactive-results-summary.golden.html',
    );
  });

  it('names the run when the summary is narrowed to one, escaped', () => {
    const html = renderInteractiveResultsSummaryHtml({ ...SUMMARY, runId: 'run-<2>' });

    expect(html).toContain('<h1>Live execution results: run-&lt;2&gt;</h1>');
  });

  it('escapes a failure message and leaves out the failures list when there is none', () => {
    const [passedRow, failedRow] = SUMMARY.rows;
    if (passedRow === undefined || failedRow === undefined) {
      throw new Error('fixture needs two rows');
    }
    const withFailure = renderInteractiveResultsSummaryHtml({
      ...SUMMARY,
      rows: [{ ...failedRow, failureMessage: '<b>boom</b>' }],
    });
    const withoutFailure = renderInteractiveResultsSummaryHtml({ ...SUMMARY, rows: [passedRow] });

    expect(withFailure).toContain('&lt;b&gt;boom&lt;/b&gt;');
    expect(withoutFailure).not.toContain('<h2>Failures</h2>');
  });
});
