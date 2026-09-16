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
