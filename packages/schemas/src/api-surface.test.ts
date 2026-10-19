// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { ApiEndpointSchema, ApiSurfaceSchema } from './api-surface.js';

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

  it('accepts a discovered endpoint with the raw paths it was templated from', () => {
    const result = ApiSurfaceSchema.safeParse({
      generatedAt: '2026-09-16T12:00:00Z',
      endpoints: [
        { method: 'GET', path: '/tasks/{id}', source: 'discovered', examples: ['/tasks/1', '/tasks/2'] },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('ApiEndpointSchema environment (ADR-0020)', () => {
  const endpoint = { method: 'GET', path: '/brands', source: 'discovered' };

  it('accepts an endpoint that names its environment, and one that does not', () => {
    expect(ApiEndpointSchema.safeParse({ ...endpoint, environment: 'staging' }).success).toBe(true);
    expect(ApiEndpointSchema.safeParse(endpoint).success).toBe(true);
  });

  it('rejects an empty environment name', () => {
    expect(ApiEndpointSchema.safeParse({ ...endpoint, environment: '' }).success).toBe(false);
  });
});
