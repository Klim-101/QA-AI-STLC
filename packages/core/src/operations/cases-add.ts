// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  SCHEMA_VERSION,
  ScopeSchema,
  TestCaseSchema,
  type RelativePath,
  type Scope,
} from '@qa-ai-stlc/schemas';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { readJsonFile } from '../json-file.js';
import { ManifestStore } from '../manifest-store.js';
import { assertRelativePath, resolveRelativePath } from '../paths.js';
import { QaStore } from '../qa-store.js';
import { findUnlinkedRequirementIds } from '../requirement-linking.js';

const SCOPE_PATH: RelativePath = 'artifacts/scope.json';

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
 * test-case content itself (ADR-001) — checks every `requirementIds` entry against the current
 * scope artifact, and only then registers it under `artifacts/cases/<id>.json`. A case linking to
 * a requirement id that does not exist in `artifacts/scope.json` is rejected here, before it is
 * ever written; `qa validate` re-checks every already-registered case the same way, so a link
 * broken later by editing `scope.json` is caught too.
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
  const scope = await loadScope(store);
  const unlinked = findUnlinkedRequirementIds(testCase.requirementIds, scope);
  if (unlinked.length > 0) {
    throw new QaError(
      'CASE_UNLINKED_REQUIREMENT',
      `Case "${testCase.id}" links to requirement(s) not in artifacts/scope.json: ${unlinked.join(', ')}`,
      { remediation: 'Run "qa scope" to register the requirement first, or fix the case\'s requirementIds.' },
    );
  }

  const casePath: RelativePath = `artifacts/cases/${testCase.id}.json`;
  const serialized = JSON.stringify(testCase);
  await store.writeJson(casePath, testCase);
  await new ManifestStore({ store, clock: context.clock }).register(casePath, serialized);

  return { casePath, id: testCase.id, requirementIds: testCase.requirementIds };
}

async function loadScope(store: QaStore): Promise<Scope> {
  const exists = await store.pathExists(SCOPE_PATH);
  if (!exists) {
    return { schemaVersion: SCHEMA_VERSION, generatedAt: new Date(0).toISOString(), requirements: [] };
  }
  return store.readJson(SCOPE_PATH, ScopeSchema);
}
