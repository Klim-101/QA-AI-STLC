// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { ManifestSchema } from './manifest.js';

describe('ManifestSchema', () => {
  it('accepts artifacts keyed by project-relative path', () => {
    const result = ManifestSchema.safeParse({
      artifacts: {
        'artifacts/scope.json': { sha256: 'd'.repeat(64), registeredAt: '2026-09-16T12:00:00Z' },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an entry with a malformed hash', () => {
    const result = ManifestSchema.safeParse({
      artifacts: {
        'artifacts/scope.json': { sha256: 'not-a-hash', registeredAt: '2026-09-16T12:00:00Z' },
      },
    });
    expect(result.success).toBe(false);
  });
});
