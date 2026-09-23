// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  SCHEMA_VERSION,
  ScopeSchema,
  TestCaseSchema,
  type RelativePath,
  type Scope,
} from '@qa-ai-stlc/schemas';
import { loadConfig } from '../config-loader.js';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { readJsonFile, toCanonicalJson } from '../json-file.js';
import { ManifestStore } from '../manifest-store.js';
import { assertRelativePath, resolveRelativePath } from '../paths.js';
import { QaStore } from '../qa-store.js';
import { findUnlinkedRequirementIds } from '../requirement-linking.js';
import { findUndecidedTestingTypes } from '../testing-scope.js';

const SCOPE_PATH: RelativePath = 'artifacts/scope.json';
const DEFAULT_SCOPE_GENERATED_AT = new Date(0).toISOString();

export interface CasesAddOptions {
  readonly path?: string;
}

export interface CasesAddResult {
  readonly casePath: string;
  readonly id: string;
  readonly requirementIds: readonly string[];
}

/**
 * `qa cases add --path <path>` / MCP `qa_cases_add` (development plan section 2.7 step 9, P2-03,
 * P2-05): validates a test case a human or an agent wrote as JSON — the engine never authors
 * test-case content itself (ADR-001) — rejects it while any testing-scope type is still
 * `undecided` or the case's own `testType` is not `in-scope` (P2-16, never a silently-skipped
 * case for an out-of-scope type), checks every `requirementIds` entry against the current
 * scope artifact, and only then registers it under `artifacts/cases/<feature>/<id>.json` (P2-20)
 * using the case's own `feature` field. A case linking to a requirement id that does not exist in
 * `artifacts/scope.json` is rejected here, before it is ever written; `qa validate` re-checks every
 * already-registered case the same way, so a link broken later by editing `scope.json` is caught
 * too.
 */
export async function runCasesAdd(context: EngineContext, options: CasesAddOptions): Promise<CasesAddResult> {
  if (options.path === undefined) {
    throw new QaError('CASES_ADD_USAGE', 'Usage: qa cases add --path <path>', {
      remediation: 'Example: qa cases add --path cases/login.json',
    });
  }
  const path = assertRelativePath(options.path);
  const absolutePath = resolveRelativePath(context.projectRoot, path);
  const exists = await context.fs.pathExists(absolutePath);
  if (!exists) {
    throw new QaError('CASES_ADD_FILE_NOT_FOUND', `"${path}" does not exist`, {
      remediation: 'Check --path points at a real, readable file relative to the project root.',
    });
  }
  const testCase = await readJsonFile(context.fs, absolutePath, TestCaseSchema);

  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const config = await loadConfig(store);
  const undecided = findUndecidedTestingTypes(config.testing);
  if (undecided.length > 0) {
    throw new QaError(
      'CASES_ADD_TESTING_UNDECIDED',
      `Testing scope is still undecided for: ${undecided.join(', ')}`,
      {
        remediation:
          'Run "qa config set testing.<type> <in-scope|out-of-scope>" for each type listed, then re-run "qa cases add".',
      },
    );
  }
  if (config.testing[testCase.testType] !== 'in-scope') {
    throw new QaError(
      'CASE_TYPE_OUT_OF_SCOPE',
      `Case "${testCase.id}" is testType "${testCase.testType}", but testing.${testCase.testType} is "${config.testing[testCase.testType]}"`,
      {
        remediation: `Set "testing.${testCase.testType}" to "in-scope" first, or write this case for an in-scope type.`,
      },
    );
  }

  const manifestStore = new ManifestStore({ store, clock: context.clock });
  const scope = await loadScope(manifestStore);
  const unlinked = findUnlinkedRequirementIds(testCase.requirementIds, scope);
  if (unlinked.length > 0) {
    throw new QaError(
      'CASE_UNLINKED_REQUIREMENT',
      `Case "${testCase.id}" links to requirement(s) not in artifacts/scope.json: ${unlinked.join(', ')}`,
      { remediation: 'Run "qa scope" to register the requirement first, or fix the case\'s requirementIds.' },
    );
  }

  const casePath: RelativePath = `artifacts/cases/${testCase.feature}/${testCase.id}.json`;
  const serialized = toCanonicalJson(testCase);
  await store.writeText(casePath, serialized);
  await manifestStore.register(casePath, serialized);

  return { casePath, id: testCase.id, requirementIds: testCase.requirementIds };
}

/**
 * Verifies `artifacts/scope.json` against the manifest before trusting it for requirement links,
 * so a case cannot be registered against a hand-edited scope (P2-07, `.qa/` integrity).
 */
async function loadScope(manifestStore: ManifestStore): Promise<Scope> {
  const scope = await manifestStore.readVerified(SCOPE_PATH, ScopeSchema);
  if (scope !== undefined) {
    return scope;
  }
  return { schemaVersion: SCHEMA_VERSION, generatedAt: DEFAULT_SCOPE_GENERATED_AT, requirements: [] };
}
