// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  SCHEMA_VERSION,
  TestCaseSchema,
  type CaseSummary,
  type CasesIndex,
  type FeatureCaseIndex,
  type RelativePath,
  type TestCase,
} from '@qa-ai-stlc/schemas';
import { CASES_INDEX_PATH } from '../gate.js';
import { hashText } from '../hash.js';
import { toCanonicalJson } from '../json-file.js';
import type { ManifestStore } from '../manifest-store.js';
import { renderMarkdownArtifact } from '../render/markdown-registry.js';
import type { QaStore } from '../qa-store.js';

const CASES_DIR: RelativePath = 'artifacts/cases';

/**
 * Regenerates every feature's steps-free case index and the `cases` gate's canonical snapshot
 * (#357) from the case files registered under `artifacts/cases/**` right now. `qa cases add` calls
 * this after registering a case, so the gate's aggregate always reflects the current case set — an
 * approval bound to a stale snapshot would defeat the point of hashing it.
 */
export async function regenerateCaseIndexes(store: QaStore, manifest: ManifestStore): Promise<void> {
  const casePaths = [...(await store.listFiles(CASES_DIR))].sort();
  const cases = await Promise.all(
    casePaths.map(async (path) => ({ path, content: await store.readText(path) })),
  );
  const testCases = await Promise.all(casePaths.map((path) => store.readJson(path, TestCaseSchema)));

  const features = [...new Set(testCases.map((testCase) => testCase.feature))].sort();
  for (const feature of features) {
    const featureIndex: FeatureCaseIndex = {
      schemaVersion: SCHEMA_VERSION,
      feature,
      cases: testCases
        .filter((testCase) => testCase.feature === feature)
        .map(toCaseSummary)
        .sort((a, b) => a.id.localeCompare(b.id)),
    };
    await writeAndRegister(
      store,
      manifest,
      `artifacts/cases-index/${feature}.json`,
      toCanonicalJson(featureIndex),
    );
    await writeAndRegister(
      store,
      manifest,
      `artifacts/cases-index/${feature}.md`,
      renderMarkdownArtifact('case-index', featureIndex),
    );
  }

  const aggregate: CasesIndex = {
    schemaVersion: SCHEMA_VERSION,
    files: cases.map(({ path, content }) => ({ path, sha256: hashText(content) })),
  };
  await writeAndRegister(store, manifest, CASES_INDEX_PATH, toCanonicalJson(aggregate));
}

function toCaseSummary(testCase: TestCase): CaseSummary {
  return {
    id: testCase.id,
    title: testCase.title,
    testType: testCase.testType,
    requirementIds: testCase.requirementIds,
    ...(testCase.description !== undefined ? { description: testCase.description } : {}),
  };
}

async function writeAndRegister(
  store: QaStore,
  manifest: ManifestStore,
  path: RelativePath,
  content: string,
): Promise<void> {
  await store.writeText(path, content);
  await manifest.register(path, content);
}
