// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { expectMatchesGoldenFile } from '@qa-ai-stlc/test-utils/golden-file';
import { describe, expect, it } from 'vitest';
import { A11Y_CONFORMANCE_REPORT } from '../test-support/a11y-conformance-report-fixture.js';
import { renderA11yConformanceMarkdown } from './a11y-conformance-markdown.js';

describe('renderA11yConformanceMarkdown', () => {
  it('matches the golden file', async () => {
    await expectMatchesGoldenFile(
      renderA11yConformanceMarkdown(A11Y_CONFORMANCE_REPORT),
      './__snapshots__/a11y-conformance.golden.md',
    );
  });

  it('states that automated results alone do not establish conformance', () => {
    expect(renderA11yConformanceMarkdown(A11Y_CONFORMANCE_REPORT)).toContain(
      'Automated results alone do not establish conformance.',
    );
  });

  it('does not mention ignored scans when there are none', () => {
    const markdown = renderA11yConformanceMarkdown({ ...A11Y_CONFORMANCE_REPORT, ignoredScanCount: 0 });

    expect(markdown).toContain('2 accessibility scan(s) recorded for this target.\n');
    expect(markdown).not.toContain('ignored');
  });
});
