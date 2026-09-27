// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { ApiSurface } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { buildApiSurface, mergeApiSurface } from './api-surface.js';
import { buildRequestLogHar, type RequestLogEntry } from './request-log.js';

const GENERATED_AT = '2026-09-27T12:00:00.000Z';

function har(entries: readonly RequestLogEntry[]): string {
  return buildRequestLogHar(entries, GENERATED_AT);
}

describe('buildApiSurface', () => {
  it('collapses repeat visits to the same route with different record ids into one endpoint', () => {
    const surface = buildApiSurface(
      har([
        { method: 'GET', url: 'https://app.example/tasks/1', status: 200, blocked: false },
        { method: 'GET', url: 'https://app.example/tasks/2', status: 200, blocked: false },
        { method: 'GET', url: 'https://app.example/tasks/3', status: 200, blocked: false },
      ]),
      GENERATED_AT,
    );

    expect(surface.endpoints).toEqual([
      {
        method: 'GET',
        path: '/tasks/{id}',
        source: 'discovered',
        examples: ['/tasks/1', '/tasks/2', '/tasks/3'],
      },
    ]);
  });

  it('collapses a UUID path segment the same way as a numeric id', () => {
    const surface = buildApiSurface(
      har([
        {
          method: 'GET',
          url: 'https://app.example/orders/3fa85f64-5717-4562-b3fc-2c963f66afa6',
          status: 200,
          blocked: false,
        },
      ]),
      GENERATED_AT,
    );

    expect(surface.endpoints).toEqual([
      {
        method: 'GET',
        path: '/orders/{id}',
        source: 'discovered',
        examples: ['/orders/3fa85f64-5717-4562-b3fc-2c963f66afa6'],
      },
    ]);
  });

  it('collapses a prefixed record id like the demo app\'s own task ids ("t-1", "t-2") into one endpoint', () => {
    const surface = buildApiSurface(
      har([
        { method: 'GET', url: 'https://app.example/tasks/t-1', status: 200, blocked: false },
        { method: 'GET', url: 'https://app.example/tasks/t-2', status: 200, blocked: false },
      ]),
      GENERATED_AT,
    );

    expect(surface.endpoints).toEqual([
      { method: 'GET', path: '/tasks/{id}', source: 'discovered', examples: ['/tasks/t-1', '/tasks/t-2'] },
    ]);
  });

  it('does not collapse a static route word that merely sits next to a collapsed one', () => {
    const surface = buildApiSurface(
      har([
        { method: 'GET', url: 'https://app.example/tasks/new', status: 200, blocked: false },
        { method: 'GET', url: 'https://app.example/tasks/t-1', status: 200, blocked: false },
      ]),
      GENERATED_AT,
    );

    const paths = surface.endpoints.map((endpoint) => endpoint.path);
    expect(paths).toContain('/tasks/new');
    expect(paths).toContain('/tasks/{id}');
  });

  it('keeps routes with no identifier segment untouched and drops the query string', () => {
    const surface = buildApiSurface(
      har([{ method: 'GET', url: 'https://app.example/tasks?sort=due', status: 200, blocked: false }]),
      GENERATED_AT,
    );

    expect(surface.endpoints).toEqual([
      { method: 'GET', path: '/tasks', source: 'discovered', examples: ['/tasks'] },
    ]);
  });

  it('keeps a blocked non-GET request as its own endpoint, distinct by method', () => {
    const surface = buildApiSurface(
      har([
        { method: 'GET', url: 'https://app.example/tasks/1', status: 200, blocked: false },
        { method: 'POST', url: 'https://app.example/tasks/1', blocked: true },
      ]),
      GENERATED_AT,
    );

    expect(surface.endpoints).toEqual([
      { method: 'GET', path: '/tasks/{id}', source: 'discovered', examples: ['/tasks/1'] },
      { method: 'POST', path: '/tasks/{id}', source: 'discovered', examples: ['/tasks/1'] },
    ]);
  });

  it('caps the kept examples instead of growing without bound', () => {
    const entries: RequestLogEntry[] = Array.from({ length: 8 }, (_, index) => ({
      method: 'GET',
      url: `https://app.example/tasks/${String(index)}`,
      status: 200,
      blocked: false,
    }));

    const surface = buildApiSurface(har(entries), GENERATED_AT);

    expect(surface.endpoints).toHaveLength(1);
    expect(surface.endpoints[0]?.examples).toHaveLength(5);
  });

  it('sorts endpoints deterministically by path then method', () => {
    const surface = buildApiSurface(
      har([
        { method: 'POST', url: 'https://app.example/tasks/1', blocked: true },
        { method: 'GET', url: 'https://app.example/admin/users', status: 200, blocked: false },
        { method: 'GET', url: 'https://app.example/tasks/1', status: 200, blocked: false },
      ]),
      GENERATED_AT,
    );

    expect(surface.endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path}`)).toEqual([
      'GET /admin/users',
      'GET /tasks/{id}',
      'POST /tasks/{id}',
    ]);
  });

  it('ignores an entry whose method the schema does not recognize', () => {
    const surface = buildApiSurface(
      har([{ method: 'TRACE', url: 'https://app.example/tasks/1', blocked: true }]),
      GENERATED_AT,
    );

    expect(surface.endpoints).toEqual([]);
  });

  it('returns no endpoints for a request log with no entries', () => {
    const surface = buildApiSurface(har([]), GENERATED_AT);
    expect(surface).toEqual({
      schemaVersion: surface.schemaVersion,
      generatedAt: GENERATED_AT,
      endpoints: [],
    });
  });

  it('returns no endpoints when the request log is not valid JSON', () => {
    const surface = buildApiSurface('not json', GENERATED_AT);
    expect(surface.endpoints).toEqual([]);
  });

  it('skips an entry whose captured url does not parse as a URL', () => {
    const surface = buildApiSurface(
      har([{ method: 'GET', url: 'not-a-url', status: 200, blocked: false }]),
      GENERATED_AT,
    );
    expect(surface.endpoints).toEqual([]);
  });

  it('returns no endpoints when the HAR log has no entries array', () => {
    const surface = buildApiSurface(JSON.stringify({ log: {} }), GENERATED_AT);
    expect(surface.endpoints).toEqual([]);
  });

  it('skips an entry with no request object at all', () => {
    const surface = buildApiSurface(JSON.stringify({ log: { entries: [{}] } }), GENERATED_AT);
    expect(surface.endpoints).toEqual([]);
  });

  it('skips an entry whose request has a method but no url', () => {
    const surface = buildApiSurface(
      JSON.stringify({ log: { entries: [{ request: { method: 'GET' } }] } }),
      GENERATED_AT,
    );
    expect(surface.endpoints).toEqual([]);
  });
});

describe('mergeApiSurface', () => {
  it('adds an endpoint the previous surface never saw', () => {
    const previous = buildApiSurface(
      har([{ method: 'GET', url: 'https://app.example/login', status: 200, blocked: false }]),
      GENERATED_AT,
    );
    const fresh = buildApiSurface(
      har([{ method: 'GET', url: 'https://app.example/tasks/1', status: 200, blocked: false }]),
      GENERATED_AT,
    );

    const merged = mergeApiSurface(previous, fresh, GENERATED_AT);

    expect(merged.endpoints.map((endpoint) => endpoint.path)).toEqual(['/login', '/tasks/{id}']);
  });

  it('keeps an endpoint the fresh surface no longer observed', () => {
    const previous = buildApiSurface(
      har([{ method: 'GET', url: 'https://app.example/tasks/1', status: 200, blocked: false }]),
      GENERATED_AT,
    );
    const fresh = buildApiSurface(har([]), GENERATED_AT);

    const merged = mergeApiSurface(previous, fresh, GENERATED_AT);

    expect(merged.endpoints).toEqual(previous.endpoints);
  });

  it('adds a newly observed raw path to an endpoint already known from a different one', () => {
    const previous = buildApiSurface(
      har([{ method: 'GET', url: 'https://app.example/tasks/1', status: 200, blocked: false }]),
      GENERATED_AT,
    );
    const fresh = buildApiSurface(
      har([{ method: 'GET', url: 'https://app.example/tasks/2', status: 200, blocked: false }]),
      GENERATED_AT,
    );

    const merged = mergeApiSurface(previous, fresh, GENERATED_AT);

    expect(merged.endpoints).toEqual([
      { method: 'GET', path: '/tasks/{id}', source: 'discovered', examples: ['/tasks/1', '/tasks/2'] },
    ]);
  });

  it('merges onto an existing endpoint whose fresh side carries no examples (a synthesized or contract endpoint)', () => {
    const previous = buildApiSurface(
      har([{ method: 'GET', url: 'https://app.example/tasks/1', status: 200, blocked: false }]),
      GENERATED_AT,
    );
    const fresh: ApiSurface = {
      schemaVersion: previous.schemaVersion,
      generatedAt: GENERATED_AT,
      endpoints: [{ method: 'GET', path: '/tasks/{id}', source: 'openapi' }],
    };

    const merged = mergeApiSurface(previous, fresh, GENERATED_AT);

    expect(merged.endpoints).toEqual([
      { method: 'GET', path: '/tasks/{id}', source: 'openapi', examples: ['/tasks/1'] },
    ]);
  });

  it('stops adding examples once the per-endpoint cap is reached', () => {
    const previous = buildApiSurface(
      har(
        Array.from({ length: 5 }, (_, index) => ({
          method: 'GET' as const,
          url: `https://app.example/tasks/${String(index)}`,
          status: 200,
          blocked: false,
        })),
      ),
      GENERATED_AT,
    );
    const fresh = buildApiSurface(
      har([{ method: 'GET', url: 'https://app.example/tasks/99', status: 200, blocked: false }]),
      GENERATED_AT,
    );

    const merged = mergeApiSurface(previous, fresh, GENERATED_AT);

    expect(merged.endpoints[0]?.examples).toEqual(previous.endpoints[0]?.examples);
  });
});
