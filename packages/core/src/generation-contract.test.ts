// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  ProvenSessionSchema,
  SCHEMA_VERSION,
  type SelectorRegistry,
  type TestCase,
} from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import {
  buildGenerationSpokeInput,
  buildRegistrySlice,
  isGeneratedTestSpecStale,
  stampGeneratedTestSpec,
} from './generation-contract.js';
import type { Clock } from './ports/clock.js';

const FIXED_TIME = new Date('2026-09-25T12:00:00Z');
const fixedClock: Clock = { now: () => FIXED_TIME };

const testCase: TestCase = {
  schemaVersion: SCHEMA_VERSION,
  id: 'case-1',
  feature: 'checkout',
  requirementIds: ['req-1'],
  testType: 'e2e',
  title: 'Guest can check out',
  steps: [{ description: 'Add an item to the cart' }],
  expectedResult: 'The order confirmation page is shown',
  status: 'approved',
  createdAt: '2026-09-25T12:00:00Z',
};

const registry: SelectorRegistry = {
  schemaVersion: SCHEMA_VERSION,
  generatedAt: '2026-09-25T12:00:00Z',
  elements: [
    {
      elementId: 'el-1',
      name: 'checkoutButton',
      kind: 'button',
      locatorCandidates: [{ strategy: 'testId', value: 'checkout-button', fragile: false }],
      stabilityScore: 1,
      lastVerifiedAt: '2026-09-25T12:00:00Z',
      source: 'crawl',
    },
    {
      elementId: 'el-2',
      name: 'cartCount',
      kind: 'text',
      locatorCandidates: [],
      stabilityScore: 0,
      lastVerifiedAt: '2026-09-25T12:00:00Z',
      source: 'crawl',
    },
    {
      elementId: 'el-3',
      kind: 'text',
      locatorCandidates: [{ strategy: 'text', value: 'Total', fragile: true }],
      stabilityScore: 0.5,
      lastVerifiedAt: '2026-09-25T12:00:00Z',
      source: 'crawl',
    },
    {
      elementId: 'el-4',
      name: 'appHeader',
      kind: 'heading',
      locatorCandidates: [{ strategy: 'role', value: '{"role":"heading","name":"App"}', fragile: false }],
      stabilityScore: 1,
      lastVerifiedAt: '2026-09-25T12:00:00Z',
      source: 'crawl',
    },
  ],
};

describe('buildRegistrySlice', () => {
  it('keeps only the requested elements, in the registry’s own order', () => {
    const slice = buildRegistrySlice(registry, ['el-2', 'el-1']);
    expect(slice.elements.map((element) => element.elementId)).toEqual(['el-1', 'el-2']);
  });

  it('throws when a requested id has no matching element', () => {
    expect(() => buildRegistrySlice(registry, ['el-1', 'el-missing'])).toThrow('el-missing');
  });
});

describe('buildGenerationSpokeInput', () => {
  it('includes only elements the locator module actually exports a function for', () => {
    const input = buildGenerationSpokeInput({
      testCase,
      registry,
      elementIds: ['el-1', 'el-2', 'el-3'],
      locatorModuleGeneratorVersion: '0.7.0',
    });

    expect(input.locatorModule.exports).toEqual([{ elementId: 'el-1', name: 'checkoutButton' }]);
    expect(input.registrySlice.elements).toHaveLength(3);
  });

  it('sorts multiple exports by elementId', () => {
    const input = buildGenerationSpokeInput({
      testCase,
      registry,
      elementIds: ['el-1', 'el-4'],
      locatorModuleGeneratorVersion: '0.7.0',
    });

    expect(input.locatorModule.exports).toEqual([
      { elementId: 'el-1', name: 'checkoutButton' },
      { elementId: 'el-4', name: 'appHeader' },
    ]);
  });

  it('produces a valid GenerationSpokeInput for a case with no locator-generatable elements', () => {
    const input = buildGenerationSpokeInput({
      testCase,
      registry,
      elementIds: [],
      locatorModuleGeneratorVersion: '0.7.0',
    });

    expect(input.locatorModule.exports).toEqual([]);
  });

  it('omits provenSession when none is given', () => {
    const input = buildGenerationSpokeInput({
      testCase,
      registry,
      elementIds: [],
      locatorModuleGeneratorVersion: '0.7.0',
    });

    expect(input.provenSession).toBeUndefined();
  });

  it('includes a given provenSession, so it becomes part of sourceHash (P3-07)', () => {
    const provenSession = ProvenSessionSchema.parse({
      testCaseId: 'case-1',
      runResultId: 'run-result-1',
      steps: [
        {
          stepId: 'step-1',
          description: 'Add an item to the cart',
          actions: [{ type: 'click', sessionId: 'session-1', stepId: 'step-1', at: '2026-09-25T12:00:00Z' }],
        },
      ],
    });

    const input = buildGenerationSpokeInput({
      testCase,
      registry,
      elementIds: [],
      locatorModuleGeneratorVersion: '0.7.0',
      provenSession,
    });

    expect(input.provenSession).toMatchObject(provenSession);
  });
});

describe('stampGeneratedTestSpec and isGeneratedTestSpecStale', () => {
  it('stamps a deterministic sourceHash for the same input', () => {
    const input = buildGenerationSpokeInput({
      testCase,
      registry,
      elementIds: ['el-1'],
      locatorModuleGeneratorVersion: '0.7.0',
    });

    const first = stampGeneratedTestSpec({
      input,
      content: 'export const GENERATOR_VERSION = "0.1.0";',
      filePath: 'tests/qa/checkout/guest-checkout.spec.ts',
      generatorVersion: '0.1.0',
      clock: fixedClock,
    });
    const second = stampGeneratedTestSpec({
      input,
      content: 'export const GENERATOR_VERSION = "0.1.0";',
      filePath: 'tests/qa/checkout/guest-checkout.spec.ts',
      generatorVersion: '0.1.0',
      clock: fixedClock,
    });

    expect(first.sourceHash).toBe(second.sourceHash);
    expect(first.generatedAt).toBe('2026-09-25T12:00:00.000Z');
  });

  it('is not stale against the exact input it was stamped from', () => {
    const input = buildGenerationSpokeInput({
      testCase,
      registry,
      elementIds: ['el-1'],
      locatorModuleGeneratorVersion: '0.7.0',
    });
    const spec = stampGeneratedTestSpec({
      input,
      content: 'export const GENERATOR_VERSION = "0.1.0";',
      filePath: 'tests/qa/checkout/guest-checkout.spec.ts',
      generatorVersion: '0.1.0',
      clock: fixedClock,
    });

    expect(isGeneratedTestSpecStale(spec, input)).toBe(false);
  });

  it('is stale once the case behind it changes', () => {
    const input = buildGenerationSpokeInput({
      testCase,
      registry,
      elementIds: ['el-1'],
      locatorModuleGeneratorVersion: '0.7.0',
    });
    const spec = stampGeneratedTestSpec({
      input,
      content: 'export const GENERATOR_VERSION = "0.1.0";',
      filePath: 'tests/qa/checkout/guest-checkout.spec.ts',
      generatorVersion: '0.1.0',
      clock: fixedClock,
    });

    const changedInput = buildGenerationSpokeInput({
      testCase: { ...testCase, title: 'Guest can check out with a coupon' },
      registry,
      elementIds: ['el-1'],
      locatorModuleGeneratorVersion: '0.7.0',
    });

    expect(isGeneratedTestSpecStale(spec, changedInput)).toBe(true);
  });

  it('is stale once qa-execute produces a new proven session for the case (P3-07)', () => {
    const input = buildGenerationSpokeInput({
      testCase,
      registry,
      elementIds: ['el-1'],
      locatorModuleGeneratorVersion: '0.7.0',
    });
    const spec = stampGeneratedTestSpec({
      input,
      content: 'export const GENERATOR_VERSION = "0.1.0";',
      filePath: 'tests/qa/checkout/guest-checkout.spec.ts',
      generatorVersion: '0.1.0',
      clock: fixedClock,
    });

    const reExecutedInput = buildGenerationSpokeInput({
      testCase,
      registry,
      elementIds: ['el-1'],
      locatorModuleGeneratorVersion: '0.7.0',
      provenSession: ProvenSessionSchema.parse({
        testCaseId: 'case-1',
        runResultId: 'run-result-2',
        steps: [
          {
            stepId: 'step-1',
            description: 'Add an item to the cart',
            actions: [
              { type: 'click', sessionId: 'session-1', stepId: 'step-1', at: '2026-09-25T13:00:00Z' },
            ],
          },
        ],
      }),
    });

    expect(isGeneratedTestSpecStale(spec, reExecutedInput)).toBe(true);
  });
});
