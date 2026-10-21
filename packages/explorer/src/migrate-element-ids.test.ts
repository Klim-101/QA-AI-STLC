// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { executedElementId, legacyExecutedElementId, type EnvironmentScope } from '@qa-ai-stlc/core';
import { SCHEMA_VERSION, type SelectorElement, type SelectorRegistry } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { migrateElementIds } from './migrate-element-ids.js';

const STAGING: EnvironmentScope = {
  name: 'staging',
  baseUrl: 'https://staging.example.com/',
  allowlist: ['staging.example.com'],
};

function element(overrides: Partial<SelectorElement>): SelectorElement {
  return {
    elementId: 'old-id',
    name: 'logIn',
    kind: 'button',
    locatorCandidates: [{ strategy: 'role', value: 'role=button[name="Log in"]', fragile: false }],
    stabilityScore: 1,
    lastVerifiedAt: '2026-09-17T00:00:00Z',
    source: 'crawl',
    pageUrl: 'https://staging.example.com/login',
    ...overrides,
  };
}

function registryOf(...elements: SelectorElement[]): SelectorRegistry {
  return { schemaVersion: SCHEMA_VERSION, generatedAt: '2026-09-17T00:00:00Z', elements };
}

describe('migrateElementIds', () => {
  it('gives a crawled element its new id and keeps everything else about it', () => {
    const previous = registryOf(element({}));

    const migrated = migrateElementIds(previous, new Map([['old-id', 'new-id']]), STAGING);

    expect(migrated.elements).toEqual([element({ elementId: 'new-id' })]);
  });

  it('leaves an element whose id is not in the map, and one of another environment', () => {
    const production = element({ elementId: 'old-id', environment: 'production' });
    const unknown = element({ elementId: 'other-id' });

    const migrated = migrateElementIds(
      registryOf(production, unknown),
      new Map([['old-id', 'new-id']]),
      STAGING,
    );

    expect(migrated.elements).toEqual([production, unknown]);
  });

  it('does not give an id that another element already has', () => {
    const previous = registryOf(
      element({ elementId: 'old-id' }),
      element({ elementId: 'new-id', name: 'x' }),
    );

    const migrated = migrateElementIds(previous, new Map([['old-id', 'new-id']]), STAGING);

    expect(migrated.elements.map((item) => item.elementId)).toEqual(['old-id', 'new-id']);
  });

  it('gives a session-registered element the id it would get now, recomputed from what it stores', () => {
    const pageUrl = 'https://staging.example.com/cart';
    const legacyId = legacyExecutedElementId(pageUrl, 'button', '#buy');
    const executed = element({
      elementId: legacyId,
      source: 'execute',
      pageUrl,
      locatorCandidates: [{ strategy: 'execute', value: '#buy', fragile: true }],
    });

    const migrated = migrateElementIds(registryOf(executed), new Map(), STAGING);

    expect(migrated.elements[0]?.elementId).toBe(executedElementId(pageUrl, 'button', '#buy', STAGING));
  });

  it('leaves a session-registered element whose id is not the old formula, or that has no page or selector', () => {
    const pageUrl = 'https://staging.example.com/cart';
    const candidates = [{ strategy: 'execute', value: '#buy', fragile: true }];
    const custom = element({
      elementId: 'custom',
      source: 'execute',
      pageUrl,
      locatorCandidates: candidates,
    });
    const withoutPage: SelectorElement = {
      elementId: 'no-page',
      kind: 'button',
      locatorCandidates: candidates,
      stabilityScore: 1,
      lastVerifiedAt: '2026-09-17T00:00:00Z',
      source: 'execute',
    };
    const noSelector = element({
      elementId: 'no-selector',
      source: 'execute',
      pageUrl,
      locatorCandidates: [],
    });

    const migrated = migrateElementIds(registryOf(custom, withoutPage, noSelector), new Map(), STAGING);

    expect(migrated.elements.map((item) => item.elementId)).toEqual(['custom', 'no-page', 'no-selector']);
  });
});
