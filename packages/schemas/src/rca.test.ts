// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { RcaSchema } from './rca.js';

describe('RcaSchema', () => {
  it('accepts an RCA with facts and hypotheses separated', () => {
    const result = RcaSchema.safeParse({
      defectId: 'defect-1',
      facts: ['The submit request is never sent per the network trace'],
      hypotheses: [
        { description: 'A client-side validation error is silently swallowed', confidence: 'medium' },
      ],
      remediation: ['Surface validation errors to the user'],
      status: 'draft',
      createdAt: '2026-09-16T12:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts the defect hash the engine stamps and rejects a malformed one', () => {
    const rca = {
      defectId: 'defect-1',
      facts: [],
      hypotheses: [{ description: 'A cause', confidence: 'low' }],
      remediation: [],
      status: 'draft',
      createdAt: '2026-09-16T12:00:00Z',
    };

    expect(RcaSchema.safeParse({ ...rca, defectSha256: 'a'.repeat(64) }).success).toBe(true);
    expect(RcaSchema.safeParse({ ...rca, defectSha256: 'not-a-hash' }).success).toBe(false);
  });

  it('defaults the evidence a RCA rests on to none and keeps what it is given', () => {
    const rca = {
      defectId: 'defect-1',
      facts: [],
      hypotheses: [{ description: 'A cause', confidence: 'low' }],
      remediation: [],
      status: 'draft',
      createdAt: '2026-09-16T12:00:00Z',
    };

    expect(RcaSchema.parse(rca).evidencePaths).toEqual([]);
    expect(RcaSchema.parse({ ...rca, evidencePaths: ['evidence/run-1/log-1.log'] }).evidencePaths).toEqual([
      'evidence/run-1/log-1.log',
    ]);
  });

  it('requires at least one hypothesis', () => {
    const result = RcaSchema.safeParse({
      defectId: 'defect-1',
      facts: [],
      hypotheses: [],
      remediation: [],
      status: 'draft',
      createdAt: '2026-09-16T12:00:00Z',
    });
    expect(result.success).toBe(false);
  });
});
