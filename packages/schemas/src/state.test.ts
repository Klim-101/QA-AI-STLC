// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { PipelineStateSchema } from './state.js';

describe('PipelineStateSchema', () => {
  it('accepts a state with a gate per known phase', () => {
    const result = PipelineStateSchema.safeParse({
      currentPhase: 'scope',
      gates: { scope: { status: 'open' }, cases: { status: 'open' } },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown phase name', () => {
    const result = PipelineStateSchema.safeParse({
      currentPhase: 'scope',
      gates: { scope: { status: 'open' }, run: { status: 'open' } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown gate status', () => {
    const result = PipelineStateSchema.safeParse({
      currentPhase: 'scope',
      gates: { scope: { status: 'approved' }, cases: { status: 'open' } },
    });
    expect(result.success).toBe(false);
  });
});
