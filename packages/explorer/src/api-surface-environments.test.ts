// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { scopeOfEnvironment } from '@qa-ai-stlc/core';
import { SCHEMA_VERSION, type ApiEndpoint, type ApiSurface } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { mergeApiSurface } from './api-surface.js';

const LOCAL = scopeOfEnvironment('local', { baseUrl: 'http://localhost:4200', allowlist: ['localhost'] });
const NOW = '2026-10-19T12:00:00Z';

function surface(endpoints: readonly ApiEndpoint[]): ApiSurface {
  return { schemaVersion: SCHEMA_VERSION, generatedAt: '2026-10-18T12:00:00Z', endpoints: [...endpoints] };
}

function endpoint(path: string, extra: Partial<ApiEndpoint> = {}): ApiEndpoint {
  return { method: 'GET', path, source: 'discovered', ...extra };
}

function pathsAndEnvironments(merged: ApiSurface): { path: string; environment: string | undefined }[] {
  return merged.endpoints.map((entry) => ({ path: entry.path, environment: entry.environment }));
}

// The endpoints a crawl showed belong to its environment (ADR-0020).
describe('mergeApiSurface with a scope', () => {
  it('records the environment on every endpoint a crawl found', () => {
    const merged = mergeApiSurface(surface([]), surface([endpoint('/brands')]), NOW, LOCAL);

    expect(pathsAndEnvironments(merged)).toEqual([{ path: '/brands', environment: 'local' }]);
  });

  it('leaves the endpoints of another environment as they were', () => {
    const other = endpoint('/orders', { environment: 'public', examples: ['/orders'] });

    const merged = mergeApiSurface(surface([other]), surface([endpoint('/brands')]), NOW, LOCAL);

    expect(merged.endpoints).toContainEqual(other);
    expect(pathsAndEnvironments(merged)).toContainEqual({ path: '/brands', environment: 'local' });
  });

  it('keeps the same endpoint of two environments as two entries, in a fixed order', () => {
    const publicEndpoint = endpoint('/brands', { environment: 'public' });

    const merged = mergeApiSurface(surface([publicEndpoint]), surface([endpoint('/brands')]), NOW, LOCAL);

    expect(merged.endpoints.map((entry) => entry.environment)).toEqual(['local', 'public']);
  });

  it('claims an endpoint stored without an environment, merging its examples', () => {
    const legacy = endpoint('/brands', { examples: ['/brands?page=1'] });
    const fresh = endpoint('/brands', { examples: ['/brands?page=2'] });

    const merged = mergeApiSurface(surface([legacy]), surface([fresh]), NOW, LOCAL);

    expect(merged.endpoints).toEqual([
      endpoint('/brands', { environment: 'local', examples: ['/brands?page=1', '/brands?page=2'] }),
    ]);
  });

  it('records the environment on a stored endpoint it keeps because the crawl did not see it again', () => {
    const merged = mergeApiSurface(surface([endpoint('/old')]), surface([endpoint('/brands')]), NOW, LOCAL);

    expect(merged.endpoints.find((entry) => entry.path === '/old')?.environment).toBe('local');
  });

  it('is unchanged without a scope: nothing is recorded', () => {
    const merged = mergeApiSurface(surface([endpoint('/a')]), surface([endpoint('/b')]), NOW);

    expect(merged.endpoints.map((entry) => entry.environment)).toEqual([undefined, undefined]);
  });
});
