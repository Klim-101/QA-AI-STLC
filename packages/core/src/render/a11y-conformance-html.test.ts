// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { expectMatchesGoldenFile } from '@qa-ai-stlc/test-utils/golden-file';
import { describe, expect, it } from 'vitest';
import { renderA11yConformanceHtml } from './a11y-conformance-html.js';
import { A11Y_CONFORMANCE_REPORT } from '../test-support/a11y-conformance-report-fixture.js';

describe('renderA11yConformanceHtml', () => {
  it('matches the golden file', async () => {
    await expectMatchesGoldenFile(
      renderA11yConformanceHtml(A11Y_CONFORMANCE_REPORT),
      './__snapshots__/a11y-conformance.golden.html',
    );
  });

  it('states that automated results alone do not establish conformance', () => {
    expect(renderA11yConformanceHtml(A11Y_CONFORMANCE_REPORT)).toContain(
      'Automated results alone do not establish conformance.',
    );
  });

  it('escapes criterion names', () => {
    const html = renderA11yConformanceHtml({
      ...A11Y_CONFORMANCE_REPORT,
      criteria: [{ ...A11Y_CONFORMANCE_REPORT.criteria[0]!, name: '<script>' }],
    });

    expect(html).toContain('1.1.1 &lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});
