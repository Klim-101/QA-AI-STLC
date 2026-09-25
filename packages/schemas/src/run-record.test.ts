// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { RunRecordSchema } from './run-record.js';

function validRunRecord(): Record<string, unknown> {
  return {
    id: 'run-1',
    testType: 'e2e',
    specFiles: ['tests/login.playwright-spec.ts'],
    baseUrl: 'http://localhost:4310/',
    startedAt: '2026-09-25T10:00:00Z',
    finishedAt: '2026-09-25T10:00:05Z',
    resultIds: ['run-result-1', 'run-result-2'],
    counts: { passed: 1, failed: 1, blocked: 0, skipped: 0, uncertain: 0, partial: 0 },
  };
}

describe('RunRecordSchema', () => {
  it('accepts a valid run record', () => {
    const result = RunRecordSchema.safeParse(validRunRecord());
    expect(result.success).toBe(true);
  });

  it('rejects an empty specFiles array', () => {
    const result = RunRecordSchema.safeParse({ ...validRunRecord(), specFiles: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a record that finished before it started', () => {
    const result = RunRecordSchema.safeParse({
      ...validRunRecord(),
      startedAt: '2026-09-25T10:00:05Z',
      finishedAt: '2026-09-25T10:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects counts that do not sum to the number of resultIds', () => {
    const result = RunRecordSchema.safeParse({
      ...validRunRecord(),
      resultIds: ['run-result-1'],
      counts: { passed: 1, failed: 1, blocked: 0, skipped: 0, uncertain: 0, partial: 0 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects counts missing a status key', () => {
    const result = RunRecordSchema.safeParse({
      ...validRunRecord(),
      counts: { passed: 1, failed: 1 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-project-relative spec file path', () => {
    const result = RunRecordSchema.safeParse({
      ...validRunRecord(),
      specFiles: ['/absolute/path.spec.ts'],
    });
    expect(result.success).toBe(false);
  });
});
