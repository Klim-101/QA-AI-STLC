// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Rca } from '@qa-ai-stlc/schemas';
import { expectMatchesGoldenFile } from '@qa-ai-stlc/test-utils/golden-file';
import { describe, expect, it } from 'vitest';
import { renderRcaMarkdown } from './rca-markdown.js';

const RCA: Rca = {
  schemaVersion: 1,
  defectId: 'login-error-missing',
  facts: ['The login request returns 401 with an error body', 'The page does not render the error body'],
  hypotheses: [
    {
      description: 'The error handler is not wired to the login form',
      confidence: 'high',
      evidenceNeeded: 'The component source for the login form submit handler',
    },
    { description: 'A recent refactor dropped the error state', confidence: 'low' },
  ],
  remediation: ['Render the error body returned by the login request'],
  regressionRecommendation: 'Add an end-to-end case that submits bad credentials and expects the message.',
  status: 'draft',
  createdAt: '2026-10-07T10:00:00Z',
};

describe('renderRcaMarkdown', () => {
  it('matches the golden file', async () => {
    await expectMatchesGoldenFile(renderRcaMarkdown(RCA), './__snapshots__/rca.golden.md');
  });

  it('says so when no fact is confirmed and omits the empty optional sections', () => {
    const markdown = renderRcaMarkdown({
      schemaVersion: 1,
      defectId: RCA.defectId,
      facts: [],
      hypotheses: RCA.hypotheses,
      remediation: [],
      status: 'draft',
      createdAt: RCA.createdAt,
    });

    expect(markdown).toContain('No confirmed facts recorded.');
    expect(markdown).not.toContain('## Remediation');
    expect(markdown).not.toContain('## Regression recommendation');
  });

  it('ends with a single trailing newline', () => {
    const markdown = renderRcaMarkdown(RCA);

    expect(markdown.endsWith('\n')).toBe(true);
    expect(markdown.endsWith('\n\n')).toBe(false);
  });
});
