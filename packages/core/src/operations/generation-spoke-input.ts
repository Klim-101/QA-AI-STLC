// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  SCHEMA_VERSION,
  SelectorRegistrySchema,
  TestCaseSchema,
  type GenerationSpokeInput,
  type Identifier,
  type ProvenSession,
  type RelativePath,
  type SelectorRegistry,
  type TestCase,
} from '@qa-ai-stlc/schemas';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { loadApiContract, selectContractOperations } from '../api-contract.js';
import { loadConfig } from '../config-loader.js';
import { buildApiGenerationSpokeInput, buildGenerationSpokeInput } from '../generation-contract.js';
import { resolveRelativePath } from '../paths.js';
import { QaStore } from '../qa-store.js';
import { findCasePath } from './cases-render.js';

const REGISTRY_PATH: RelativePath = 'selectors/registry.json';
// The one manifest entry that lives in the real project tree, not under `.qa/` (ADR-006), so it
// cannot be read through `QaStore`. `packages/core` cannot import `@qa-ai-stlc/explorer` to reuse
// its own copy of this path (AGENTS.md section 3, dependencies point downward only) — `validate.ts`
// keeps the same duplicated constant for the same reason.
const LOCATOR_MODULE_PATH = 'tests/qa/locators.ts';

// Avoids a capturing regex on purpose, the same reasoning `verification.ts`'s `tsc` diagnostic
// parser and `proven-session.ts`'s step-id parser document: `noUncheckedIndexedAccess` types every
// capture group `string | undefined` regardless of the pattern, forcing an unreachable fallback for
// a group the pattern already guarantees. Plain string operations keep every branch here real.
const GENERATOR_VERSION_PREFIX = 'export const GENERATOR_VERSION = "';

function parseGeneratorVersion(source: string): string | undefined {
  const prefixIndex = source.indexOf(GENERATOR_VERSION_PREFIX);
  if (prefixIndex === -1) {
    return undefined;
  }
  const valueStart = prefixIndex + GENERATOR_VERSION_PREFIX.length;
  const valueEnd = source.indexOf('"', valueStart);
  if (valueEnd === -1) {
    return undefined;
  }
  return source.slice(valueStart, valueEnd);
}

async function buildApiSpokeInput(
  context: EngineContext,
  testCase: TestCase,
  options: GenerationSpokeInputOptions,
): Promise<GenerationSpokeInput> {
  if (testCase.endpoints === undefined) {
    throw new QaError(
      'API_CASE_INVALID',
      `Case "${testCase.id}" lists no "endpoints", so no contract operations can be selected for it.`,
      { remediation: 'Add the contract operations the case exercises to its "endpoints".' },
    );
  }
  const contract = await loadApiContract(context, await loadConfig(context), options.environment);
  return buildApiGenerationSpokeInput({
    testCase,
    apiContract: selectContractOperations(contract, testCase.endpoints),
    ...(options.provenSession !== undefined ? { provenSession: options.provenSession } : {}),
  });
}

export interface GenerationSpokeInputOptions {
  readonly testCaseId: Identifier;
  /** Registry element ids an `e2e` case needs; an `api` case has none and ignores it. */
  readonly elementIds: readonly Identifier[];
  /** Which environment's contract to load for an `api` case; required when there is more than one. */
  readonly environment?: string;
  /** The case's proven `qa-execute` session (`findLatestProvenSession`), when one exists. */
  readonly provenSession?: ProvenSession;
}

/**
 * Assembles the exact input a `generate-test-spec` spoke task (P3-07) receives (`qa.generation_spoke_input`):
 * reads the registered case, the current project-wide selector registry, and the real, currently
 * generated locator module's own `GENERATOR_VERSION` stamp — never assumed equal to any particular
 * package's version, always read back from the file `qa explore` actually wrote, the same
 * "verify, don't trust convention" principle AGENTS.md 12.7 already applies elsewhere.
 */
export async function runBuildGenerationSpokeInput(
  context: EngineContext,
  options: GenerationSpokeInputOptions,
): Promise<GenerationSpokeInput> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const casePath = await findCasePath(store, options.testCaseId);
  const testCase = await store.readJson(casePath, TestCaseSchema);

  if (testCase.testType === 'api') {
    return buildApiSpokeInput(context, testCase, options);
  }

  const registryExists = await store.pathExists(REGISTRY_PATH);
  const registry: SelectorRegistry = registryExists
    ? await store.readJson(REGISTRY_PATH, SelectorRegistrySchema)
    : { schemaVersion: SCHEMA_VERSION, generatedAt: context.clock.now().toISOString(), elements: [] };

  const locatorModuleAbsolutePath = resolveRelativePath(context.projectRoot, LOCATOR_MODULE_PATH);
  const locatorModuleExists = await context.fs.pathExists(locatorModuleAbsolutePath);
  if (!locatorModuleExists) {
    throw new QaError('GENERATION_LOCATOR_MODULE_MISSING', `"${LOCATOR_MODULE_PATH}" does not exist yet.`, {
      remediation: 'Run "qa explore" first to generate the locator module.',
    });
  }
  const locatorModuleSource = await context.fs.readFile(locatorModuleAbsolutePath);
  const locatorModuleGeneratorVersion = parseGeneratorVersion(locatorModuleSource);
  if (locatorModuleGeneratorVersion === undefined) {
    throw new QaError(
      'GENERATION_LOCATOR_MODULE_VERSION_MISSING',
      `"${LOCATOR_MODULE_PATH}" has no "GENERATOR_VERSION" export.`,
      { remediation: 'Re-run "qa explore" to regenerate the locator module.' },
    );
  }

  return buildGenerationSpokeInput({
    testCase,
    registry,
    elementIds: options.elementIds,
    locatorModuleGeneratorVersion,
    ...(options.provenSession !== undefined ? { provenSession: options.provenSession } : {}),
  });
}
