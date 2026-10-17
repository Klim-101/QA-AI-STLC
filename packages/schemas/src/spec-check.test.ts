// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { SpecCheckSummarySchema } from './spec-check.js';

describe('SpecCheckSummarySchema', () => {
  it('accepts a summary and defaults the schema version', () => {
    const summary = SpecCheckSummarySchema.parse({
      counts: { passed: 1, failed: 0, blocked: 0, skipped: 0, uncertain: 0, partial: 0 },
      results: [{ testCaseId: 'login', status: 'passed' }],
    });

    expect(summary.schemaVersion).toBe(1);
  });

  it('rejects a status the engine does not report', () => {
    expect(
      SpecCheckSummarySchema.safeParse({ counts: {}, results: [{ testCaseId: 'login', status: 'green' }] })
        .success,
    ).toBe(false);
  });
});
