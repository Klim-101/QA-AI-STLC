// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  REGRESSION_TIERS,
  SCHEMA_VERSION,
  type RegressionExcludedCase,
  type RegressionIncludedCase,
  type RegressionPlan,
  type RegressionRouteReason,
  type RegressionSpecRun,
  type RegressionTier,
  type TestCase,
  type TestType,
} from '@qa-ai-stlc/schemas';

/** What the engine found about the generated spec of one case. */
export type CaseSpecState =
  | { readonly kind: 'none' }
  | { readonly kind: 'verified'; readonly specPath: string }
  | { readonly kind: 'stale' }
  | { readonly kind: 'changed' };

export interface RegressionPlanInput {
  readonly cases: readonly TestCase[];
  readonly maxTier: RegressionTier;
  /** Ids of the cases whose recorded history the configured flaky thresholds call flaky. */
  readonly flakyCaseIds: ReadonlySet<string>;
  /** What the engine found about each case's spec; a case with no entry has no verified spec. */
  readonly specStates: ReadonlyMap<string, CaseSpecState>;
}

function tierRank(tier: RegressionTier): number {
  return REGRESSION_TIERS.indexOf(tier);
}

function routeOf(state: CaseSpecState): {
  readonly route: 'spec' | 'live';
  readonly routeReason: RegressionRouteReason;
  readonly specPath?: string;
} {
  switch (state.kind) {
    case 'verified':
      return { route: 'spec', routeReason: 'verified-spec', specPath: state.specPath };
    case 'stale':
      return { route: 'live', routeReason: 'stale-spec' };
    case 'changed':
      return { route: 'live', routeReason: 'spec-changed' };
    case 'none':
      return { route: 'live', routeReason: 'no-verified-spec' };
  }
}

function groupSpecRuns(included: readonly RegressionIncludedCase[]): RegressionSpecRun[] {
  const byType = new Map<TestType, Set<string>>();
  for (const entry of included) {
    if (entry.specPath !== undefined) {
      byType.set(entry.testType, (byType.get(entry.testType) ?? new Set<string>()).add(entry.specPath));
    }
  }
  return [...byType.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([testType, specFiles]) => ({ testType, specFiles: [...specFiles].toSorted() }));
}

/**
 * Selects the regression pack (P4-09): an approved case is in when its tier is at or below
 * `maxTier` and the recorded history does not call it flaky; each one that is out says why, and each
 * one that is in is routed to a verified generated spec when one still stands, to live execution
 * when not. A case with no tier cannot be placed against a threshold, so it is out and says so.
 * The order of the pack is its tiers' order, then the case id.
 */
export function planRegression(input: RegressionPlanInput): RegressionPlan {
  const included: RegressionIncludedCase[] = [];
  const excluded: RegressionExcludedCase[] = [];
  for (const testCase of input.cases) {
    const base = { testCaseId: testCase.id, title: testCase.title };
    const tier = testCase.regressionTier;
    if (testCase.status !== 'approved') {
      excluded.push({ ...base, reason: 'not-approved', ...(tier === undefined ? {} : { tier }) });
    } else if (tier === undefined) {
      excluded.push({ ...base, reason: 'no-tier' });
    } else if (tierRank(tier) > tierRank(input.maxTier)) {
      excluded.push({ ...base, reason: 'tier-above-threshold', tier });
    } else if (input.flakyCaseIds.has(testCase.id)) {
      excluded.push({ ...base, reason: 'flaky', tier });
    } else {
      included.push({
        ...base,
        tier,
        testType: testCase.testType,
        ...routeOf(input.specStates.get(testCase.id) ?? { kind: 'none' }),
      });
    }
  }
  included.sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || a.testCaseId.localeCompare(b.testCaseId));
  excluded.sort((a, b) => a.testCaseId.localeCompare(b.testCaseId));
  return {
    schemaVersion: SCHEMA_VERSION,
    maxTier: input.maxTier,
    included,
    excluded,
    specRuns: groupSpecRuns(included),
  };
}
