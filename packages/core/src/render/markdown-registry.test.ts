// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { TestCase } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { renderMarkdownArtifact } from './markdown-registry.js';

const TEST_CASE: TestCase = {
  schemaVersion: 1,
  id: 'case-1',
  feature: 'checkout',
  requirementIds: ['r1'],
  testType: 'e2e',
  title: 'A case',
  steps: [{ description: 'Do something' }],
  expectedResult: 'Something happens',
  status: 'draft',
  createdAt: '2026-09-20T12:00:00Z',
};

describe('renderMarkdownArtifact', () => {
  it('dispatches "test-case" to the test-case renderer', () => {
    const markdown = renderMarkdownArtifact('test-case', TEST_CASE);

    expect(markdown).toContain('# A case');
    expect(markdown).toContain('**Feature:** checkout');
  });
});
