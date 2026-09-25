// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { FeatureCaseIndexSchema, type CasesIndex } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { CASES_INDEX_PATH } from '../gate.js';
import { hashText } from '../hash.js';
import { toCanonicalJson } from '../json-file.js';
import { ManifestStore } from '../manifest-store.js';
import { QaStore } from '../qa-store.js';
import { regenerateCaseIndexes } from './cases-index.js';

const PROJECT_ROOT = join('project');

function caseJson(overrides: {
  id: string;
  feature: string;
  requirementIds: string[];
  description?: string;
}): string {
  return toCanonicalJson({
    id: overrides.id,
    feature: overrides.feature,
    requirementIds: overrides.requirementIds,
    testType: 'e2e',
    title: `Case ${overrides.id}`,
    ...(overrides.description !== undefined ? { description: overrides.description } : {}),
    steps: [{ description: 'Do something' }],
    expectedResult: 'Something happens',
    status: 'draft',
    createdAt: '2026-09-20T12:00:00Z',
  });
}

function setup(): { store: QaStore; manifest: ManifestStore } {
  const store = new QaStore({ projectRoot: PROJECT_ROOT, fs: createFakeFileSystem() });
  const manifest = new ManifestStore({ store });
  return { store, manifest };
}

describe('regenerateCaseIndexes', () => {
  it('writes a per-feature JSON and Markdown index with a steps-free summary of each case', async () => {
    const { store, manifest } = setup();
    const case1 = caseJson({
      id: 'case-1',
      feature: 'checkout',
      requirementIds: ['r1'],
      description: 'Happy-path checkout',
    });
    const case2 = caseJson({ id: 'case-2', feature: 'checkout', requirementIds: ['r2'] });
    await store.writeText('artifacts/cases/checkout/case-1.json', case1);
    await manifest.register('artifacts/cases/checkout/case-1.json', case1);
    await store.writeText('artifacts/cases/checkout/case-2.json', case2);
    await manifest.register('artifacts/cases/checkout/case-2.json', case2);

    await regenerateCaseIndexes(store, manifest);

    const index = await store.readJson('artifacts/cases-index/checkout.json', FeatureCaseIndexSchema);
    expect(index.feature).toBe('checkout');
    expect(index.cases).toEqual([
      {
        id: 'case-1',
        title: 'Case case-1',
        testType: 'e2e',
        requirementIds: ['r1'],
        description: 'Happy-path checkout',
      },
      { id: 'case-2', title: 'Case case-2', testType: 'e2e', requirementIds: ['r2'] },
    ]);
    expect(index.cases[0]).not.toHaveProperty('steps');

    const markdown = await store.readText('artifacts/cases-index/checkout.md');
    expect(markdown).toContain('# Test cases: checkout');
    expect(markdown).toContain('Case case-1');
    expect(markdown).not.toContain('Do something');
  });

  it('groups cases into separate indexes per feature', async () => {
    const { store, manifest } = setup();
    const checkoutCase = caseJson({ id: 'case-1', feature: 'checkout', requirementIds: ['r1'] });
    const loginCase = caseJson({ id: 'case-2', feature: 'login', requirementIds: ['r2'] });
    await store.writeText('artifacts/cases/checkout/case-1.json', checkoutCase);
    await manifest.register('artifacts/cases/checkout/case-1.json', checkoutCase);
    await store.writeText('artifacts/cases/login/case-2.json', loginCase);
    await manifest.register('artifacts/cases/login/case-2.json', loginCase);

    await regenerateCaseIndexes(store, manifest);

    expect(await store.pathExists('artifacts/cases-index/checkout.json')).toBe(true);
    expect(await store.pathExists('artifacts/cases-index/login.json')).toBe(true);
  });

  it('writes the cases-gate aggregate with a hash for every registered case file', async () => {
    const { store, manifest } = setup();
    const case1 = caseJson({ id: 'case-1', feature: 'checkout', requirementIds: ['r1'] });
    await store.writeText('artifacts/cases/checkout/case-1.json', case1);
    await manifest.register('artifacts/cases/checkout/case-1.json', case1);

    await regenerateCaseIndexes(store, manifest);

    const aggregateRaw = await store.readText(CASES_INDEX_PATH);
    const aggregate = JSON.parse(aggregateRaw) as CasesIndex;
    expect(aggregate.files).toEqual([
      { path: 'artifacts/cases/checkout/case-1.json', sha256: hashText(case1) },
    ]);
  });

  it("changes the aggregate's hash when a case is added, so the cases gate reopens (#357)", async () => {
    const { store, manifest } = setup();
    const case1 = caseJson({ id: 'case-1', feature: 'checkout', requirementIds: ['r1'] });
    await store.writeText('artifacts/cases/checkout/case-1.json', case1);
    await manifest.register('artifacts/cases/checkout/case-1.json', case1);
    await regenerateCaseIndexes(store, manifest);
    const before = await store.readText(CASES_INDEX_PATH);

    const case2 = caseJson({ id: 'case-2', feature: 'checkout', requirementIds: ['r1'] });
    await store.writeText('artifacts/cases/checkout/case-2.json', case2);
    await manifest.register('artifacts/cases/checkout/case-2.json', case2);
    await regenerateCaseIndexes(store, manifest);
    const after = await store.readText(CASES_INDEX_PATH);

    expect(after).not.toBe(before);
  });

  it('writes an empty aggregate when there are no cases', async () => {
    const { store, manifest } = setup();

    await regenerateCaseIndexes(store, manifest);

    const aggregate = JSON.parse(await store.readText(CASES_INDEX_PATH)) as CasesIndex;
    expect(aggregate.files).toEqual([]);
  });
});
