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
 * Where a registered case's readable Markdown lives. Not under `artifacts/cases/`: everything there
 * is a case file the `cases` gate hashes and every reader parses as a `TestCase`.
 */
export function caseMarkdownPath(feature: string, id: string): RelativePath {
  return `artifacts/cases-md/${feature}/${id}.md`;
}

/**
 * Regenerates every feature's steps-free case index and the `cases` gate's canonical snapshot
 * (#357), and each case's readable Markdown (#636), from the case files registered under
 * `artifacts/cases/**` right now. `qa cases add` calls
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

  // The review copy of each case, with every step and the expected result: the operator reads these
  // before approving the `cases` gate. JSON stays canonical (ADR-002); these are rendered from it.
  for (const testCase of testCases) {
    await writeAndRegister(
      store,
      manifest,
      caseMarkdownPath(testCase.feature, testCase.id),
      renderMarkdownArtifact('test-case', testCase),
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
