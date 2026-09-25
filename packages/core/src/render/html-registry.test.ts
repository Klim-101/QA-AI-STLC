// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { RunRecord } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import type { TraceabilityMatrix } from '../traceability.js';
import { renderHtmlArtifact } from './html-registry.js';

describe('renderHtmlArtifact', () => {
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

    const html = renderHtmlArtifact('run-summary', runRecord);

    expect(html).toContain('<h1>Run summary: run-1</h1>');
  });

  it('dispatches "traceability-matrix" to the traceability-matrix renderer', () => {
    const matrix: TraceabilityMatrix = { generatedAt: '2026-09-25T10:00:00.000Z', requirements: [] };

    const html = renderHtmlArtifact('traceability-matrix', matrix);

    expect(html).toContain('<h1>Traceability matrix</h1>');
  });
});
