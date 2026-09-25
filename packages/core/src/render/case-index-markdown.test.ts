// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { FeatureCaseIndex } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { renderCaseIndexMarkdown } from './case-index-markdown.js';

describe('renderCaseIndexMarkdown', () => {
  it('renders one section per case, including its description', () => {
    const index: FeatureCaseIndex = {
      schemaVersion: 1,
      feature: 'checkout',
      cases: [
        {
          id: 'case-1',
          title: 'User can complete checkout',
          testType: 'e2e',
          requirementIds: ['r1'],
          description: 'Happy-path checkout with a valid card',
        },
      ],
    };

    const markdown = renderCaseIndexMarkdown(index);

    expect(markdown).toContain('# Test cases: checkout');
    expect(markdown).toContain('## User can complete checkout');
    expect(markdown).toContain('**Id:** case-1');
    expect(markdown).toContain('**Test type:** e2e');
    expect(markdown).toContain('**Requirements:** r1');
    expect(markdown).toContain('**Description:** Happy-path checkout with a valid card');
  });

  it('renders a case with no description without a Description row', () => {
    const index: FeatureCaseIndex = {
      schemaVersion: 1,
      feature: 'checkout',
      cases: [{ id: 'case-1', title: 'A case', testType: 'e2e', requirementIds: ['r1'] }],
    };

    const markdown = renderCaseIndexMarkdown(index);

    expect(markdown).not.toContain('**Description:**');
  });

  it('renders a placeholder for a feature with no cases yet', () => {
    const index: FeatureCaseIndex = { schemaVersion: 1, feature: 'checkout', cases: [] };

    const markdown = renderCaseIndexMarkdown(index);

    expect(markdown).toContain('No test cases registered for this feature yet.');
  });
});
