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

  it('accepts an element with no locator candidates (strict-no-css found none)', () => {
    const result = SelectorRegistrySchema.safeParse({
      generatedAt: '2026-09-16T12:00:00Z',
      elements: [
        {
          elementId: 'checkout-submit-button',
          kind: 'button',
          locatorCandidates: [],
          stabilityScore: 0,
          lastVerifiedAt: '2026-09-16T12:00:00Z',
          pii: false,
          dynamicText: false,
          source: 'crawl',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an element both with and without a name (name is optional)', () => {
    const withoutName = SelectorRegistrySchema.safeParse({
      generatedAt: '2026-09-16T12:00:00Z',
      elements: [
        {
          elementId: 'checkout-submit-button',
          kind: 'button',
          locatorCandidates: [],
          stabilityScore: 0,
          lastVerifiedAt: '2026-09-16T12:00:00Z',
          pii: false,
          dynamicText: false,
          source: 'crawl',
        },
      ],
    });
    expect(withoutName.success).toBe(true);

    const withName = SelectorRegistrySchema.safeParse({
      generatedAt: '2026-09-16T12:00:00Z',
      elements: [
        {
          elementId: 'checkout-submit-button',
          name: 'submitButton',
          kind: 'button',
          locatorCandidates: [],
          stabilityScore: 0,
          lastVerifiedAt: '2026-09-16T12:00:00Z',
          pii: false,
          dynamicText: false,
          source: 'crawl',
        },
      ],
    });
    expect(withName.success).toBe(true);
    expect(withName.data?.elements[0]?.name).toBe('submitButton');
  });

  it('accepts an element with no pii/dynamicText, since no detection exists yet (regression, #284)', () => {
    const result = SelectorRegistrySchema.safeParse({
      generatedAt: '2026-09-16T12:00:00Z',
      elements: [
        {
          elementId: 'checkout-submit-button',
          kind: 'button',
          locatorCandidates: [],
          stabilityScore: 0,
          lastVerifiedAt: '2026-09-16T12:00:00Z',
          source: 'crawl',
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data?.elements[0]?.pii).toBeUndefined();
    expect(result.data?.elements[0]?.dynamicText).toBeUndefined();
  });

  it('accepts a static element with a source file location and rejects a non-project-relative path', () => {
    const element = {
      elementId: 'login-submit',
      name: 'submit',
      kind: 'button',
      locatorCandidates: [{ strategy: 'testId', value: 'submit', fragile: false }],
      stabilityScore: 0,
      lastVerifiedAt: '2026-09-16T12:00:00Z',
      pii: false,
      dynamicText: false,
      source: 'static',
    };

    const withLocation = SelectorRegistrySchema.safeParse({
      generatedAt: '2026-09-16T12:00:00Z',
      elements: [{ ...element, sourceLocation: { filePath: 'src/components/LoginForm.tsx', line: 42 } }],
    });
    expect(withLocation.success).toBe(true);
    expect(withLocation.data?.elements[0]?.sourceLocation).toEqual({
      filePath: 'src/components/LoginForm.tsx',
      line: 42,
    });

    const withAbsolutePath = SelectorRegistrySchema.safeParse({
      generatedAt: '2026-09-16T12:00:00Z',
      elements: [{ ...element, sourceLocation: { filePath: '/src/components/LoginForm.tsx', line: 42 } }],
    });
    expect(withAbsolutePath.success).toBe(false);
  });
});
