// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  RegressionTierSchema,
  TestCaseSchema,
  VerificationRecordSchema,
  type RegressionPlan,
  type TestCase,
  type VerificationRecord,
} from '@qa-ai-stlc/schemas';
import { loadConfig } from '../config-loader.js';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { isFlakyHistory } from '../flaky-detection.js';
import { ManifestStore } from '../manifest-store.js';
import { resolveRelativePath } from '../paths.js';
import { QaStore } from '../qa-store.js';
import { planRegression, type CaseSpecState } from '../regression-plan.js';
import { historyOfCase, loadAllRunResults } from '../triage-failures.js';

const CASES_DIR = 'artifacts/cases/';

export interface RegressionPlanOptions {
  readonly maxTier?: string;
}

/**
 * `qa.regression_plan` / `qa regression plan` (P4-09): the regression pack for a tier threshold,
 * from the registered cases, the recorded run history and the verifications the engine holds. A
 * case's spec stands when the verification that registered it is still the latest, the file is as
 * registered, and the case was not registered again after that verification.
 */
export async function runRegressionPlan(
  context: EngineContext,
  options: RegressionPlanOptions,
): Promise<RegressionPlan> {
  const maxTier = RegressionTierSchema.safeParse(options.maxTier);
  if (!maxTier.success) {
    throw new QaError('REGRESSION_TIER_INVALID', `"${String(options.maxTier)}" is not a regression tier`, {
      remediation: `Use one of: ${RegressionTierSchema.options.join(', ')}.`,
    });
  }
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const { flaky } = await loadConfig(context);

  const casePaths = await store.listFiles(CASES_DIR);
  const entries = await Promise.all(
    casePaths.map(async (path) => ({ path, testCase: await store.readJson(path, TestCaseSchema) })),
  );
  const cases = entries.map((entry) => entry.testCase);
  const results = await loadAllRunResults(store);
  const flakyCaseIds = new Set(
    cases
      .filter((testCase) =>
        isFlakyHistory(
          historyOfCase(results, testCase.id).map((entry) => entry.status),
          flaky,
        ),
      )
      .map((testCase) => testCase.id),
  );

  const verifications = await readConsumedVerifications(store);
  const registered = (await manifest.load()).artifacts;
  const states = new Map<string, CaseSpecState>();
  for (const { path, testCase } of entries) {
    states.set(
      testCase.id,
      await specStateOf(context, manifest, testCase, verifications, registered[path]?.registeredAt),
    );
  }

  return planRegression({
    cases,
    maxTier: maxTier.data,
    flakyCaseIds,
    specStates: states,
  });
}

async function readConsumedVerifications(store: QaStore): Promise<readonly VerificationRecord[]> {
  const paths = (await store.listFiles('verifications')).filter((path) => path.endsWith('.json'));
  const records = await Promise.all(paths.map((path) => store.readJson(path, VerificationRecordSchema)));
  return records.filter((record) => record.status === 'verified' && record.consumedAt !== undefined);
}

async function specStateOf(
  context: EngineContext,
  manifest: ManifestStore,
  testCase: TestCase,
  verifications: readonly VerificationRecord[],
  caseRegisteredAt: string | undefined,
): Promise<CaseSpecState> {
  const latest = verifications
    .filter((record) => record.testCaseId === testCase.id)
    .toSorted((a, b) => new Date(b.verifiedAt).getTime() - new Date(a.verifiedAt).getTime())[0];
  if (latest === undefined) {
    return { kind: 'none' };
  }
  const absolutePath = resolveRelativePath(context.projectRoot, latest.filePath);
  if (
    !(await context.fs.pathExists(absolutePath)) ||
    !(await manifest.verifyContent(latest.filePath, await context.fs.readBytes(absolutePath)))
  ) {
    return { kind: 'changed' };
  }
  // A case the manifest does not hold cannot be shown to be unchanged since the verification.
  if (caseRegisteredAt === undefined || new Date(caseRegisteredAt) > new Date(latest.verifiedAt)) {
    return { kind: 'stale' };
  }
  return { kind: 'verified', specPath: latest.filePath };
}
