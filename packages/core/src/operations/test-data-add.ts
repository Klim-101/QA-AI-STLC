// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { TestDataSchema, type RelativePath } from '@qa-ai-stlc/schemas';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { readJsonFile, toCanonicalJson } from '../json-file.js';
import { ManifestStore } from '../manifest-store.js';
import { assertRelativePath, resolveRelativePath } from '../paths.js';
import { QaStore } from '../qa-store.js';

export interface TestDataAddOptions {
  readonly path?: string;
}

export interface TestDataAddResult {
  readonly testDataPath: string;
  readonly id: string;
}

/**
 * `qa test-data add --path <path>` / MCP `qa_test_data_add` (P2-22): validates a reusable
 * test-data set a human or an agent wrote as JSON — the engine never authors its content, the same
 * boundary `qa cases add` already applies to cases (ADR-001) — and registers it under
 * `artifacts/test-data/<feature>/<id>.json`, using the set's own `feature` field (P2-20's
 * feature-folder convention). Unlike a case, a test-data set links to nothing else at write time,
 * so there is no cross-artifact check here; `qa validate` is what rejects a case's dangling
 * `testDataRefs` entry against the sets this registers.
 */
export async function runTestDataAdd(
  context: EngineContext,
  options: TestDataAddOptions,
): Promise<TestDataAddResult> {
  if (options.path === undefined) {
    throw new QaError('TEST_DATA_ADD_USAGE', 'Usage: qa test-data add --path <path>', {
      remediation: 'Example: qa test-data add --path test-data/checkout-card.json',
    });
  }
  const path = assertRelativePath(options.path);
  const absolutePath = resolveRelativePath(context.projectRoot, path);
  const exists = await context.fs.pathExists(absolutePath);
  if (!exists) {
    throw new QaError('TEST_DATA_ADD_FILE_NOT_FOUND', `"${path}" does not exist`, {
      remediation: 'Check --path points at a real, readable file relative to the project root.',
    });
  }
  const testData = await readJsonFile(context.fs, absolutePath, TestDataSchema);

  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifestStore = new ManifestStore({ store, clock: context.clock });
  const testDataPath: RelativePath = `artifacts/test-data/${testData.feature}/${testData.id}.json`;
  const serialized = toCanonicalJson(testData);
  await store.writeText(testDataPath, serialized);
  await manifestStore.register(testDataPath, serialized);

  return { testDataPath, id: testData.id };
}
