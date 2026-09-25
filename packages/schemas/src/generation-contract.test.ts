// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  GeneratedTestSpecSchema,
  GenerationSpokeInputSchema,
  LocatorModuleExportSchema,
  ManualRegionSchema,
} from './generation-contract.js';

const testCase = {
  id: 'case-1',
  feature: 'checkout',
  requirementIds: ['req-1'],
  testType: 'e2e' as const,
  title: 'Guest can check out',
  steps: [{ description: 'Add an item to the cart' }],
  expectedResult: 'The order confirmation page is shown',
  status: 'approved' as const,
  createdAt: '2026-09-25T12:00:00Z',
};

const registrySlice = {
  generatedAt: '2026-09-25T12:00:00Z',
  elements: [
    {
      elementId: 'el-1',
      name: 'checkoutButton',
      kind: 'button',
      locatorCandidates: [{ strategy: 'testId', value: 'checkout-button', fragile: false }],
      stabilityScore: 1,
      lastVerifiedAt: '2026-09-25T12:00:00Z',
      source: 'crawl' as const,
    },
  ],
};

describe('LocatorModuleExportSchema', () => {
  it('accepts an elementId/name pair', () => {
    const result = LocatorModuleExportSchema.safeParse({ elementId: 'el-1', name: 'checkoutButton' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty export name', () => {
    const result = LocatorModuleExportSchema.safeParse({ elementId: 'el-1', name: '' });
    expect(result.success).toBe(false);
  });
});

describe('GenerationSpokeInputSchema', () => {
  it('accepts a case, a registry slice and the locator module export list', () => {
    const result = GenerationSpokeInputSchema.safeParse({
      testCase,
      registrySlice,
      locatorModule: {
        generatorVersion: '0.7.0',
        exports: [{ elementId: 'el-1', name: 'checkoutButton' }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a registry slice missing required fields', () => {
    const result = GenerationSpokeInputSchema.safeParse({
      testCase,
      registrySlice: { elements: [] },
      locatorModule: { generatorVersion: '0.7.0', exports: [] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a locator module with an empty generator version', () => {
    const result = GenerationSpokeInputSchema.safeParse({
      testCase,
      registrySlice,
      locatorModule: { generatorVersion: '', exports: [] },
    });
    expect(result.success).toBe(false);
  });
});

describe('ManualRegionSchema', () => {
  it('accepts an id and its preserved content', () => {
    const result = ManualRegionSchema.safeParse({ id: 'custom-assertion', content: 'expect(x).toBe(1);' });
    expect(result.success).toBe(true);
  });

  it('accepts empty content (a region a human left blank)', () => {
    const result = ManualRegionSchema.safeParse({ id: 'custom-assertion', content: '' });
    expect(result.success).toBe(true);
  });

  it('rejects a missing id', () => {
    const result = ManualRegionSchema.safeParse({ content: 'x' });
    expect(result.success).toBe(false);
  });
});

describe('GeneratedTestSpecSchema', () => {
  it('accepts a fully stamped generated spec', () => {
    const result = GeneratedTestSpecSchema.safeParse({
      testCaseId: 'case-1',
      generatorVersion: '0.1.0',
      filePath: 'tests/qa/checkout/guest-checkout.spec.ts',
      sourceHash: 'a'.repeat(64),
      generatedAt: '2026-09-25T12:00:00Z',
      content: 'export const GENERATOR_VERSION = "0.1.0";',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an absolute file path', () => {
    const result = GeneratedTestSpecSchema.safeParse({
      testCaseId: 'case-1',
      generatorVersion: '0.1.0',
      filePath: '/tests/qa/checkout/guest-checkout.spec.ts',
      sourceHash: 'a'.repeat(64),
      generatedAt: '2026-09-25T12:00:00Z',
      content: 'export const GENERATOR_VERSION = "0.1.0";',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed source hash', () => {
    const result = GeneratedTestSpecSchema.safeParse({
      testCaseId: 'case-1',
      generatorVersion: '0.1.0',
      filePath: 'tests/qa/checkout/guest-checkout.spec.ts',
      sourceHash: 'not-a-hash',
      generatedAt: '2026-09-25T12:00:00Z',
      content: 'export const GENERATOR_VERSION = "0.1.0";',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty content', () => {
    const result = GeneratedTestSpecSchema.safeParse({
      testCaseId: 'case-1',
      generatorVersion: '0.1.0',
      filePath: 'tests/qa/checkout/guest-checkout.spec.ts',
      sourceHash: 'a'.repeat(64),
      generatedAt: '2026-09-25T12:00:00Z',
      content: '',
    });
    expect(result.success).toBe(false);
  });
});
