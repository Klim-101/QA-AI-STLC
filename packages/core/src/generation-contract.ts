// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  GeneratedTestSpecSchema,
  GenerationSpokeInputSchema,
  type ApiContractSlice,
  type GeneratedTestSpec,
  type GenerationSpokeInput,
  type Identifier,
  type LocatorModuleExport,
  type ProvenSession,
  type RelativePath,
  type SelectorRegistry,
  type TestCase,
} from '@qa-ai-stlc/schemas';
import { QaError } from './errors.js';
import { hashText } from './hash.js';
import { toCanonicalJson } from './json-file.js';
import type { Clock } from './ports/clock.js';

// Filters a project-wide registry down to the elements a generation spoke (P3-07) actually needs
// for one case (P3-05's "registry slice"), keeping the original registry's element order.
// `elementIds` is caller-selected — which elements a case's steps need is a generation heuristic
// this contract does not define — so an id that does not resolve is a caller bug, not a registry
// gap, and fails loudly rather than silently narrowing the slice.
export function buildRegistrySlice(
  registry: SelectorRegistry,
  elementIds: readonly Identifier[],
): SelectorRegistry {
  const requested = new Set(elementIds);
  const foundIds = new Set(
    registry.elements
      .filter((element) => requested.has(element.elementId))
      .map((element) => element.elementId),
  );
  const missing = elementIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new QaError(
      'core.generation_contract.unknown_element_id',
      `registry has no element for: ${missing.join(', ')}`,
    );
  }
  return {
    ...registry,
    elements: registry.elements.filter((element) => requested.has(element.elementId)),
  };
}

export interface BuildGenerationSpokeInputOptions {
  readonly testCase: TestCase;
  readonly registry: SelectorRegistry;
  readonly elementIds: readonly Identifier[];
  readonly locatorModuleGeneratorVersion: string;
  /**
   * Every function the real locator module exports, as `parseLocatorModuleExports` read it. Only the
   * ones answering an element of the slice are passed on, so a spec can import exactly those.
   */
  readonly locatorModuleExports: readonly LocatorModuleExport[];
  /** The case's proven `qa-execute` session (`findLatestProvenSession`), when one exists. */
  readonly provenSession?: ProvenSession;
}

/** Assembles the exact input a `generate-test-spec` spoke task (P3-07) receives. */
export function buildGenerationSpokeInput(options: BuildGenerationSpokeInputOptions): GenerationSpokeInput {
  const registrySlice = buildRegistrySlice(options.registry, options.elementIds);
  const sliceElementIds = new Set(registrySlice.elements.map((element) => element.elementId));
  const exports = options.locatorModuleExports
    .filter((entry) => sliceElementIds.has(entry.elementId))
    .map((entry) => ({ elementId: entry.elementId, name: entry.name }))
    .sort((a, b) => a.elementId.localeCompare(b.elementId));

  return GenerationSpokeInputSchema.parse({
    testCase: options.testCase,
    registrySlice,
    locatorModule: { generatorVersion: options.locatorModuleGeneratorVersion, exports },
    ...(options.provenSession !== undefined ? { provenSession: options.provenSession } : {}),
  });
}

export interface BuildApiGenerationSpokeInputOptions {
  readonly testCase: TestCase;
  readonly apiContract: ApiContractSlice;
  readonly provenSession?: ProvenSession;
}

/**
 * The spoke input for an `api` case (P6-13): the case plus the contract operations it names,
 * with no registry slice or locator module because an API spec touches no DOM. The contract hash is
 * part of the input, so `isGeneratedTestSpecStale` also flags a spec once the contract changes.
 */
export function buildApiGenerationSpokeInput(
  options: BuildApiGenerationSpokeInputOptions,
): GenerationSpokeInput {
  return GenerationSpokeInputSchema.parse({
    testCase: options.testCase,
    apiContract: options.apiContract,
    ...(options.provenSession !== undefined ? { provenSession: options.provenSession } : {}),
  });
}

export interface StampGeneratedTestSpecOptions {
  readonly input: GenerationSpokeInput;
  readonly content: string;
  readonly filePath: RelativePath;
  readonly generatorVersion: string;
  readonly clock: Clock;
}

/**
 * Stamps a spoke's generated source with the input it was built from. `sourceHash` lets
 * `isGeneratedTestSpecStale` detect drift later without re-running generation.
 */
export function stampGeneratedTestSpec(options: StampGeneratedTestSpecOptions): GeneratedTestSpec {
  return GeneratedTestSpecSchema.parse({
    testCaseId: options.input.testCase.id,
    generatorVersion: options.generatorVersion,
    filePath: options.filePath,
    sourceHash: hashText(toCanonicalJson(options.input)),
    generatedAt: options.clock.now().toISOString(),
    content: options.content,
  });
}

/** True when the case or registry slice behind `spec` has changed since it was generated. */
export function isGeneratedTestSpecStale(
  spec: GeneratedTestSpec,
  currentInput: GenerationSpokeInput,
): boolean {
  return spec.sourceHash !== hashText(toCanonicalJson(currentInput));
}
