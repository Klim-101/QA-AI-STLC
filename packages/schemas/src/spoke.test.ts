// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  SpokeErrorSchema,
  SpokeInputRecordSchema,
  SpokeOutputRecordSchema,
  SpokePathSegmentSchema,
  SpokeResultSchema,
  SpokeValidationIssueSchema,
} from './spoke.js';

describe('SpokeResultSchema', () => {
  it('accepts an "ok" result carrying an arbitrary payload', () => {
    const result = SpokeResultSchema.safeParse({
      spokeId: 'explorer-page',
      taskId: 'task-1',
      status: 'ok',
      payload: { route: '/dashboard', elements: 3 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts an "error" result carrying a code and message with no payload', () => {
    const result = SpokeResultSchema.safeParse({
      spokeId: 'explorer-page',
      taskId: 'task-2',
      status: 'error',
      error: { code: 'SPOKE_TIMEOUT', message: 'The spoke did not respond within the configured timeout.' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts an "error" result carrying validation issues for re-dispatch', () => {
    const result = SpokeResultSchema.safeParse({
      spokeId: 'test-design',
      taskId: 'task-3',
      status: 'error',
      error: {
        code: 'SPOKE_RESULT_INVALID',
        message: 'Payload failed schema validation.',
        issues: [{ path: ['cases', 0, 'title'], message: 'Required' }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a result with no "status" discriminator', () => {
    const result = SpokeResultSchema.safeParse({
      spokeId: 'explorer-page',
      taskId: 'task-4',
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects an "ok" result missing its payload field', () => {
    const result = SpokeResultSchema.safeParse({
      spokeId: 'explorer-page',
      taskId: 'task-5',
      status: 'ok',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an "error" result missing its error field', () => {
    const result = SpokeResultSchema.safeParse({
      spokeId: 'explorer-page',
      taskId: 'task-6',
      status: 'error',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown status literal', () => {
    const result = SpokeResultSchema.safeParse({
      spokeId: 'explorer-page',
      taskId: 'task-7',
      status: 'pending',
      payload: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('SpokeErrorSchema', () => {
  it('rejects an empty code', () => {
    const result = SpokeErrorSchema.safeParse({ code: '', message: 'Something went wrong.' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty message', () => {
    const result = SpokeErrorSchema.safeParse({ code: 'SPOKE_TIMEOUT', message: '' });
    expect(result.success).toBe(false);
  });
});

describe('SpokeValidationIssueSchema', () => {
  it('accepts a mixed string/number path', () => {
    const result = SpokeValidationIssueSchema.safeParse({ path: ['cases', 0, 'title'], message: 'Required' });
    expect(result.success).toBe(true);
  });

  it('rejects an issue with no message', () => {
    const result = SpokeValidationIssueSchema.safeParse({ path: [], message: '' });
    expect(result.success).toBe(false);
  });
});

describe('SpokePathSegmentSchema', () => {
  it.each(['run-1', 'explorer-page', 'task_1.a', 'A'])('accepts "%s"', (name) => {
    expect(SpokePathSegmentSchema.safeParse(name).success).toBe(true);
  });

  it.each(['', '..', '.hidden', 'a/b', 'a\b', '-x', 'a b', 'x'.repeat(65)])(
    'rejects "%s", which is not a single safe path segment',
    (name) => {
      expect(SpokePathSegmentSchema.safeParse(name).success).toBe(false);
    },
  );
});

describe('spoke I/O records', () => {
  it('accepts an input record and defaults its schema version', () => {
    const result = SpokeInputRecordSchema.parse({
      runId: 'run-1',
      spokeId: 'explorer-page',
      taskId: 'page-1',
      attempt: 1,
      task: 'Analyze the dashboard page',
      context: { url: 'https://example.com/' },
      recordedAt: '2026-10-15T12:00:00Z',
    });

    expect(result.schemaVersion).toBe(1);
  });

  it('accepts an input record that carries no context', () => {
    const result = SpokeInputRecordSchema.safeParse({
      runId: 'run-1',
      spokeId: 'explorer-page',
      taskId: 'page-1',
      attempt: 2,
      task: 'Retry',
      recordedAt: '2026-10-15T12:00:00Z',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an input record whose spoke name could leave its folder', () => {
    const result = SpokeInputRecordSchema.safeParse({
      runId: 'run-1',
      spokeId: '../escape',
      taskId: 'page-1',
      attempt: 1,
      task: 't',
      recordedAt: '2026-10-15T12:00:00Z',
    });

    expect(result.success).toBe(false);
  });

  it('accepts an output record wrapping a spoke result', () => {
    const result = SpokeOutputRecordSchema.safeParse({
      runId: 'run-1',
      attempt: 2,
      result: { spokeId: 'explorer-page', taskId: 'page-1', status: 'ok', payload: {} },
      recordedAt: '2026-10-15T12:00:00Z',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an attempt below 1', () => {
    const result = SpokeOutputRecordSchema.safeParse({
      runId: 'run-1',
      attempt: 0,
      result: { spokeId: 'explorer-page', taskId: 'page-1', status: 'ok', payload: {} },
      recordedAt: '2026-10-15T12:00:00Z',
    });

    expect(result.success).toBe(false);
  });
});
