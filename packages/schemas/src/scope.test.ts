// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { ScopeSchema } from './scope.js';

describe('ScopeSchema', () => {
  it('accepts requirements sourced from a file and from free text', () => {
    const result = ScopeSchema.safeParse({
      generatedAt: '2026-09-16T12:00:00Z',
      requirements: [
        {
          id: 'req-1',
          title: 'Checkout accepts valid cards',
          source: { kind: 'file', path: 'requirements/checkout.md' },
          inScope: true,
        },
        {
          id: 'req-2',
          title: 'Admin can export reports',
          source: { kind: 'text', label: 'Verbal requirement from stakeholder call' },
          inScope: false,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a requirement source that is neither file nor text', () => {
    const result = ScopeSchema.safeParse({
      generatedAt: '2026-09-16T12:00:00Z',
      requirements: [{ id: 'req-1', title: 'x', source: { kind: 'tracker', id: '123' }, inScope: true }],
    });
    expect(result.success).toBe(false);
  });
});
