// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { ApiEndpoint, ApiSurface } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { diffApiSurface } from './api-diff.js';

function surface(endpoints: ApiSurface['endpoints']): ApiSurface {
  return { schemaVersion: 1, generatedAt: '2026-09-30T12:00:00Z', endpoints };
}

const contract: ApiEndpoint[] = [
  { method: 'GET', path: '/tasks/{taskId}', source: 'openapi' },
  { method: 'POST', path: '/oauth/token', source: 'openapi' },
  { method: 'POST', path: '/oauth/revoke-all', source: 'openapi' },
  { method: 'GET', path: '/api/whoami', source: 'openapi' },
];

describe('diffApiSurface', () => {
  it('classifies one finding of every kind, sorted by path then method', () => {
    const findings = diffApiSurface(
      contract,
      surface([
        { method: 'GET', path: '/tasks/{id}', source: 'discovered', examples: ['/tasks/t-1'] },
        { method: 'GET', path: '/api/whoami', source: 'discovered' },
        { method: 'GET', path: '/oauth/token', source: 'discovered' },
        { method: 'GET', path: '/oauth/issued', source: 'discovered' },
      ]),
    );
    expect(findings).toEqual([
      { kind: 'matched', method: 'GET', path: '/api/whoami' },
      { kind: 'undocumented', method: 'GET', path: '/oauth/issued' },
      { kind: 'unobserved', method: 'POST', path: '/oauth/revoke-all' },
      { kind: 'method-not-documented', method: 'GET', path: '/oauth/token' },
      { kind: 'unobserved', method: 'POST', path: '/oauth/token' },
      {
        kind: 'matched',
        method: 'GET',
        path: '/tasks/{id}',
        contractPath: '/tasks/{taskId}',
        examples: ['/tasks/t-1'],
      },
    ]);
  });

  it('reports everything unobserved when nothing was discovered', () => {
    expect(diffApiSurface(contract, surface([])).map((finding) => finding.kind)).toEqual([
      'unobserved',
      'unobserved',
      'unobserved',
      'unobserved',
    ]);
  });

  it('reports everything undocumented against an empty contract, ordering equal paths by method', () => {
    const findings = diffApiSurface(
      [],
      surface([
        { method: 'POST', path: '/x', source: 'discovered' },
        { method: 'GET', path: '/x', source: 'discovered' },
      ]),
    );
    expect(findings.map((finding) => `${finding.method} ${finding.kind}`)).toEqual([
      'GET undocumented',
      'POST undocumented',
    ]);
  });
});
