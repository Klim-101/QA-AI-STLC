// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { artifactSchemas } from './artifacts.js';

describe('artifactSchemas', () => {
  it('lists one entry per artifact kind under .qa/', () => {
    expect(Object.keys(artifactSchemas).sort()).toEqual(
      [
        'api-surface',
        'approval-ledger',
        'browser-action',
        'case-index',
        'cases-index',
        'config',
        'defect-draft',
        'evidence',
        'manifest',
        'missing-test-id-report',
        'page-models',
        'rca',
        'route-map',
        'run-result',
        'scope',
        'selector-registry',
        'state',
        'test-case',
        'test-data',
      ].sort(),
    );
  });

  it('generates a JSON Schema for every registered artifact', () => {
    for (const schema of Object.values(artifactSchemas)) {
      expect(() => z.toJSONSchema(schema)).not.toThrow();
    }
  });
});
