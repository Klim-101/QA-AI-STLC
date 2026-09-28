// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { ConfigSchema } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { findConfigRelaxations, findIssueLayers, mergeConfigLayers } from './config-layers.js';

describe('mergeConfigLayers', () => {
  it('lets a local scalar replace a committed object and records it as a local leaf', () => {
    const { merged, sources } = mergeConfigLayers({ source: { path: 'app' } }, { source: null });

    expect(merged).toStrictEqual({ source: null });
    expect(sources).toStrictEqual([{ path: ['source'], layer: 'local' }]);
  });

  it('keeps a committed value that is not an object when there is no local layer', () => {
    const { merged, sources } = mergeConfigLayers('not a mapping', undefined);

    expect(merged).toBe('not a mapping');
    expect(sources).toStrictEqual([{ path: [], layer: 'committed' }]);
  });
});

describe('findIssueLayers', () => {
  const sources = [
    { path: ['environments', 'staging', 'baseUrl'], layer: 'committed' },
    { path: ['environments', 'dev', 'baseUrl'], layer: 'local' },
  ] as const;

  it('blames the layer of the deepest ancestor that has values', () => {
    expect(findIssueLayers(['environments', 'dev', 'allowlist'], sources)).toStrictEqual(['local']);
  });

  it('names both layers when values under the ancestor come from both', () => {
    expect(findIssueLayers(['environments', 'qa'], sources)).toStrictEqual(['committed', 'local']);
  });

  it('falls back to the committed layer when no layer set anything on the path', () => {
    expect(findIssueLayers(['api'], sources)).toStrictEqual(['committed']);
    expect(findIssueLayers([], sources)).toStrictEqual(['committed']);
  });
});

describe('findConfigRelaxations', () => {
  const effective = ConfigSchema.parse({
    testing: { e2e: 'in-scope', api: 'out-of-scope', a11y: 'undecided', security: 'undecided' },
    environments: { staging: { baseUrl: 'https://staging.example.com', allowlist: ['staging.example.com'] } },
    identities: {},
    data: { strategy: 'disposable', ownerMarker: 'qa' },
    selectors: { policy: 'testid-first', testIdAttribute: 'data-testid' },
    agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 0 },
  });

  it('treats every allowlist entry as a relaxation when the committed layer is not a mapping', () => {
    expect(findConfigRelaxations(null, effective, 'local.yaml')).toStrictEqual([
      {
        kind: 'allowlist-entry',
        environment: 'staging',
        hostname: 'staging.example.com',
        localLayerPath: 'local.yaml',
      },
    ]);
  });

  it('treats a committed environment entry that is not a mapping as listing nothing', () => {
    expect(
      findConfigRelaxations({ environments: { staging: 'broken' } }, effective, 'local.yaml'),
    ).toHaveLength(1);
  });

  it('treats a committed allowlist that is not an array as listing nothing', () => {
    expect(
      findConfigRelaxations({ environments: { staging: { allowlist: 'x' } } }, effective, 'local.yaml'),
    ).toHaveLength(1);
  });
});
