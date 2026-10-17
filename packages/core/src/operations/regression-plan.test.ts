// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { hashText } from '../hash.js';
import { toCanonicalJson } from '../json-file.js';
import { ManifestStore } from '../manifest-store.js';
import { QaStore } from '../qa-store.js';
import { createFakeEngineContext } from '../test-support/fake-engine-context.js';
import { runRegressionPlan } from './regression-plan.js';

const CONFIG = [
  'schemaVersion: 1',
  'testing: { e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
  'environments:',
  '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  'flaky: { historyWindow: 6, minStatusChanges: 2 }',
  '',
].join('\n');

const SPEC = "test('x', () => {});\n";
const SPEC_PATH = 'tests/qa/generated/login.spec.ts';

function caseJson(id: string, tier: string | undefined, status = 'approved'): string {
  return toCanonicalJson({
    id,
    feature: 'f',
    requirementIds: ['r'],
    testType: 'e2e',
    title: `Case ${id}`,
    steps: [{ description: 'Do it' }],
    expectedResult: 'It works',
    status,
    ...(tier === undefined ? {} : { regressionTier: tier }),
    createdAt: '2026-10-01T09:00:00Z',
  });
}

function result(
  id: string,
  caseId: string,
  status: 'passed' | 'failed',
  minute: number,
): Record<string, unknown> {
  const at = `2026-10-10T10:${String(minute).padStart(2, '0')}:00Z`;
  return {
    schemaVersion: 1,
    id,
    runId: 'run-1',
    testCaseId: caseId,
    testType: 'e2e',
    status,
    startedAt: at,
    finishedAt: at,
    evidenceIds: [],
    ...(status === 'failed' ? { failure: { message: 'boom' } } : {}),
  };
}

interface ProjectOptions {
  readonly specVerified?:
    'verified' | 'case-registered-later' | 'spec-edited' | 'spec-missing' | 'unconsumed' | 'none';
}

async function project(options: ProjectOptions = {}): Promise<EngineContext> {
  const fs = createFakeFileSystem({ [join('project', '.qa', 'config.yaml')]: CONFIG });
  const times = ['2026-10-02T10:00:00.000Z', '2026-10-03T10:00:00.000Z', '2026-10-04T10:00:00.000Z'];
  let tick = 0;
  const context = createFakeEngineContext({
    fs,
    clock: { now: () => new Date(times[Math.min(tick++, 2)] ?? '') },
  });
  const store = new QaStore({ projectRoot: 'project', fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  // The case is registered first (10-02), the spec verified after (10-03).
  for (const [id, tier, status] of [
    ['login', 'smoke', 'approved'],
    ['checkout', 'regression', 'approved'],
    ['flip', 'smoke', 'approved'],
    ['plain', undefined, 'approved'],
    ['idea', 'smoke', 'draft'],
  ] as const) {
    const path = `artifacts/cases/f/${id}.json`;
    await store.writeText(path, caseJson(id, tier, status));
    await manifest.register(path, caseJson(id, tier, status));
  }
  const kind = options.specVerified ?? 'verified';
  if (kind !== 'none') {
    const content = kind === 'spec-edited' ? `${SPEC}// edited` : SPEC;
    if (kind !== 'spec-missing') {
      await fs.writeFile(join('project', ...SPEC_PATH.split('/')), content);
    }
    await manifest.register(SPEC_PATH, SPEC, { root: 'project' });
    await store.writeJson('verifications/verification-1.json', {
      schemaVersion: 1,
      id: 'verification-1',
      testCaseId: 'login',
      filePath: SPEC_PATH,
      contentSha256: hashText(SPEC),
      status: 'verified',
      verifiedAt: kind === 'case-registered-later' ? '2026-10-01T10:00:00Z' : '2026-10-20T10:00:00Z',
      ...(kind === 'unconsumed' ? {} : { consumedAt: '2026-10-20T10:00:01Z' }),
    });
  }
  const history = [
    result('f1', 'flip', 'passed', 0),
    result('f2', 'flip', 'failed', 1),
    result('f3', 'flip', 'passed', 2),
    result('l1', 'login', 'passed', 3),
  ];
  for (const entry of history) {
    await store.writeJson(`runs/run-1/results/${String(entry.id)}.json`, entry);
  }
  return context;
}

describe('runRegressionPlan', () => {
  it('selects by tier, leaves out the flaky, the untiered and the unapproved, and routes the case with a spec to it', async () => {
    const context = await project();

    const plan = await runRegressionPlan(context, { maxTier: 'critical-path' });

    expect(plan.included.map((entry) => [entry.testCaseId, entry.route])).toEqual([['login', 'spec']]);
    expect(plan.included[0]).toMatchObject({
      specPath: SPEC_PATH,
      routeReason: 'verified-spec',
      tier: 'smoke',
    });
    expect(Object.fromEntries(plan.excluded.map((entry) => [entry.testCaseId, entry.reason]))).toEqual({
      checkout: 'tier-above-threshold',
      flip: 'flaky',
      idea: 'not-approved',
      plain: 'no-tier',
    });
    expect(plan.specRuns).toEqual([{ testType: 'e2e', specFiles: [SPEC_PATH] }]);
  });

  it('widens to the case that has no spec and sends it live', async () => {
    const context = await project();

    const plan = await runRegressionPlan(context, { maxTier: 'extended' });

    expect(plan.included.map((entry) => [entry.testCaseId, entry.route, entry.routeReason])).toEqual([
      ['login', 'spec', 'verified-spec'],
      ['checkout', 'live', 'no-verified-spec'],
    ]);
  });

  it.each([
    ['case-registered-later', 'stale-spec'],
    ['spec-edited', 'spec-changed'],
    ['spec-missing', 'spec-changed'],
    ['unconsumed', 'no-verified-spec'],
    ['none', 'no-verified-spec'],
  ] as const)('sends the case live when the spec state is %s (%s)', async (specVerified, reason) => {
    const context = await project({ specVerified });

    const plan = await runRegressionPlan(context, { maxTier: 'smoke' });

    expect(plan.included[0]).toMatchObject({ testCaseId: 'login', route: 'live', routeReason: reason });
    expect(plan.specRuns).toEqual([]);
  });

  it('cannot show a case unchanged when the manifest does not hold it, and sends it live', async () => {
    const context = await project();
    const store = new QaStore({ projectRoot: 'project', fs: context.fs });
    const manifestPath = 'manifest.json';
    const manifest = JSON.parse(await store.readText(manifestPath)) as { artifacts: Record<string, unknown> };
    delete manifest.artifacts['artifacts/cases/f/login.json'];
    await store.writeText(manifestPath, JSON.stringify(manifest));

    const plan = await runRegressionPlan(context, { maxTier: 'smoke' });

    expect(plan.included[0]).toMatchObject({ testCaseId: 'login', route: 'live', routeReason: 'stale-spec' });
  });

  it('goes by the latest verification of the case when it has several', async () => {
    const context = await project();
    const store = new QaStore({ projectRoot: 'project', fs: context.fs });
    await store.writeJson('verifications/verification-0.json', {
      schemaVersion: 1,
      id: 'verification-0',
      testCaseId: 'login',
      filePath: 'tests/qa/generated/older.spec.ts',
      contentSha256: hashText('older'),
      status: 'verified',
      verifiedAt: '2026-10-05T10:00:00Z',
      consumedAt: '2026-10-05T10:00:01Z',
    });

    const plan = await runRegressionPlan(context, { maxTier: 'smoke' });

    expect(plan.included[0]).toMatchObject({ route: 'spec', specPath: SPEC_PATH });
  });

  it('refuses a threshold that is not a tier', async () => {
    const context = await project();

    await expect(runRegressionPlan(context, { maxTier: 'weekly' })).rejects.toMatchObject({
      code: 'REGRESSION_TIER_INVALID',
    });
    await expect(runRegressionPlan(context, {})).rejects.toMatchObject({ code: 'REGRESSION_TIER_INVALID' });
  });
});
