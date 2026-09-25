// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { FeatureCaseIndex, RunRecord, TestCase } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import type { TraceabilityMatrix } from '../traceability.js';
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

  it('dispatches "case-index" to the case-index renderer', () => {
    const index: FeatureCaseIndex = { schemaVersion: 1, feature: 'checkout', cases: [] };

    const markdown = renderMarkdownArtifact('case-index', index);

    expect(markdown).toContain('# Test cases: checkout');
  });

  it('dispatches "run-summary" to the run-summary renderer', () => {
    const runRecord: RunRecord = {
      schemaVersion: 1,
      id: 'run-1',
      testType: 'e2e',
      specFiles: ['tests/login.playwright-spec.ts'],
      baseUrl: 'https://staging.example.test/',
      startedAt: '2026-09-25T10:00:00.000Z',
      finishedAt: '2026-09-25T10:00:05.000Z',
      resultIds: [],
      counts: { passed: 0, failed: 0, blocked: 0, skipped: 0, uncertain: 0, partial: 0 },
    };

    const markdown = renderMarkdownArtifact('run-summary', runRecord);

    expect(markdown).toContain('# Run summary: run-1');
  });

  it('dispatches "traceability-matrix" to the traceability-matrix renderer', () => {
    const matrix: TraceabilityMatrix = { generatedAt: '2026-09-25T10:00:00.000Z', requirements: [] };

    const markdown = renderMarkdownArtifact('traceability-matrix', matrix);

    expect(markdown).toContain('# Traceability matrix');
  });
});
