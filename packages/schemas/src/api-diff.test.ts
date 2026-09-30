// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { ApiDiffReportSchema } from './api-diff.js';

const valid = {
  generatedAt: '2026-09-30T12:00:00Z',
  contract: { source: 'openapi.json', sha256: 'a'.repeat(64) },
  counts: { matched: 1, undocumented: 1, methodNotDocumented: 0, unobserved: 0 },
  findings: [
    { kind: 'matched', method: 'GET', path: '/tasks/{id}', contractPath: '/tasks/{taskId}' },
    { kind: 'undocumented', method: 'GET', path: '/api/whoami', examples: ['/api/whoami'] },
  ],
};

describe('ApiDiffReportSchema', () => {
  it('accepts a report and stamps the schema version', () => {
    const result = ApiDiffReportSchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data?.schemaVersion).toBeDefined();
  });

  it('rejects an unknown finding kind', () => {
    const result = ApiDiffReportSchema.safeParse({
      ...valid,
      findings: [{ kind: 'mismatch', method: 'GET', path: '/x' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed contract hash', () => {
    expect(
      ApiDiffReportSchema.safeParse({ ...valid, contract: { source: 'x', sha256: 'abc' } }).success,
    ).toBe(false);
  });
});
