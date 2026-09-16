// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { SelectorRegistrySchema } from './selector-registry.js';

describe('SelectorRegistrySchema', () => {
  it('accepts an element with a stable elementId and locator candidates', () => {
    const result = SelectorRegistrySchema.safeParse({
      generatedAt: '2026-09-16T12:00:00Z',
      elements: [
        {
          elementId: 'checkout-submit-button',
          kind: 'button',
          locatorCandidates: [{ strategy: 'testid', value: 'checkout-submit', fragile: false }],
          stabilityScore: 0.95,
          lastVerifiedAt: '2026-09-16T12:00:00Z',
          pii: false,
          dynamicText: false,
          source: 'crawl',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a stability score outside 0..1', () => {
    const result = SelectorRegistrySchema.safeParse({
      generatedAt: '2026-09-16T12:00:00Z',
      elements: [
        {
          elementId: 'checkout-submit-button',
          kind: 'button',
          locatorCandidates: [{ strategy: 'testid', value: 'checkout-submit', fragile: false }],
          stabilityScore: 1.5,
          lastVerifiedAt: '2026-09-16T12:00:00Z',
          pii: false,
          dynamicText: false,
          source: 'crawl',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an element with no locator candidates', () => {
    const result = SelectorRegistrySchema.safeParse({
      generatedAt: '2026-09-16T12:00:00Z',
      elements: [
        {
          elementId: 'checkout-submit-button',
          kind: 'button',
          locatorCandidates: [],
          stabilityScore: 0.5,
          lastVerifiedAt: '2026-09-16T12:00:00Z',
          pii: false,
          dynamicText: false,
          source: 'manual',
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
