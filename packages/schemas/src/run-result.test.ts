// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { RunResultSchema } from './run-result.js';

describe('RunResultSchema', () => {
  it('accepts a failed result with failure details', () => {
    const result = RunResultSchema.safeParse({
      id: 'result-1',
      runId: 'run-1',
      testCaseId: 'case-1',
      testType: 'e2e',
      status: 'failed',
      startedAt: '2026-09-16T12:00:00Z',
      finishedAt: '2026-09-16T12:00:05Z',
      evidenceIds: ['evidence-1'],
      failure: { message: 'Timed out waiting for selector' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts the honest "blocked" status with no failure block', () => {
    const result = RunResultSchema.safeParse({
      id: 'result-2',
      runId: 'run-1',
      testCaseId: 'case-2',
      testType: 'api',
      status: 'blocked',
      startedAt: '2026-09-16T12:00:00Z',
      finishedAt: '2026-09-16T12:00:01Z',
      evidenceIds: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown status', () => {
    const result = RunResultSchema.safeParse({
      id: 'result-3',
      runId: 'run-1',
      testCaseId: 'case-3',
      testType: 'a11y',
      status: 'flaky',
      startedAt: '2026-09-16T12:00:00Z',
      finishedAt: '2026-09-16T12:00:01Z',
      evidenceIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a result that finished before it started', () => {
    const result = RunResultSchema.safeParse({
      id: 'result-4',
      runId: 'run-1',
      testCaseId: 'case-4',
      testType: 'e2e',
      status: 'passed',
      startedAt: '2026-09-16T12:00:05Z',
      finishedAt: '2026-09-16T12:00:00Z',
      evidenceIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a "failed" status with no failure block', () => {
    const result = RunResultSchema.safeParse({
      id: 'result-5',
      runId: 'run-1',
      testCaseId: 'case-5',
      testType: 'e2e',
      status: 'failed',
      startedAt: '2026-09-16T12:00:00Z',
      finishedAt: '2026-09-16T12:00:01Z',
      evidenceIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a "partial" status with non-empty missing step IDs', () => {
    const result = RunResultSchema.safeParse({
      id: 'result-6',
      runId: 'run-1',
      testCaseId: 'case-6',
      testType: 'e2e',
      status: 'partial',
      startedAt: '2026-09-16T12:00:00Z',
      finishedAt: '2026-09-16T12:00:01Z',
      evidenceIds: [],
      missingStepIds: ['step-2', 'expected-result'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a "partial" status with no missing step IDs', () => {
    const result = RunResultSchema.safeParse({
      id: 'result-7',
      runId: 'run-1',
      testCaseId: 'case-7',
      testType: 'e2e',
      status: 'partial',
      startedAt: '2026-09-16T12:00:00Z',
      finishedAt: '2026-09-16T12:00:01Z',
      evidenceIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a "partial" status with an empty missing step IDs array', () => {
    const result = RunResultSchema.safeParse({
      id: 'result-8',
      runId: 'run-1',
      testCaseId: 'case-8',
      testType: 'e2e',
      status: 'partial',
      startedAt: '2026-09-16T12:00:00Z',
      finishedAt: '2026-09-16T12:00:01Z',
      evidenceIds: [],
      missingStepIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing step IDs on a non-"partial" status', () => {
    const result = RunResultSchema.safeParse({
      id: 'result-9',
      runId: 'run-1',
      testCaseId: 'case-9',
      testType: 'e2e',
      status: 'passed',
      startedAt: '2026-09-16T12:00:00Z',
      finishedAt: '2026-09-16T12:00:01Z',
      evidenceIds: [],
      missingStepIds: ['step-1'],
    });
    expect(result.success).toBe(false);
  });
});
