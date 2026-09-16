// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { ApiSurfaceSchema } from './api-surface.js';

describe('ApiSurfaceSchema', () => {
  it('accepts endpoints discovered from an OpenAPI contract with a stamped hash', () => {
    const result = ApiSurfaceSchema.safeParse({
      generatedAt: '2026-09-16T12:00:00Z',
      contractSha256: 'b'.repeat(64),
      endpoints: [{ method: 'GET', path: '/orders/{id}', operationId: 'getOrder', source: 'openapi' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unsupported HTTP method', () => {
    const result = ApiSurfaceSchema.safeParse({
      generatedAt: '2026-09-16T12:00:00Z',
      endpoints: [{ method: 'TRACE', path: '/orders', source: 'discovered' }],
    });
    expect(result.success).toBe(false);
  });
});
