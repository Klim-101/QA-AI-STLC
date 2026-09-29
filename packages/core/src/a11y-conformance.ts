// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { A11yConformanceLevel, A11yScanRecord, A11yWcagVersion } from '@qa-ai-stlc/schemas';
import { listApplicableCriteria, type WcagCoverage, type WcagTarget } from './a11y-criteria.js';

export type CriterionConformanceStatus =
  'passed' | 'failed' | 'needs-manual-check' | 'not-applicable' | 'excepted';

export interface A11yScanInput {
  readonly evidenceId: string;
  readonly record: A11yScanRecord;
}

export interface CriterionConformance {
  readonly criterionId: string;
  readonly name: string;
  readonly level: A11yConformanceLevel;
  readonly coverage: WcagCoverage;
  readonly status: CriterionConformanceStatus;
  /** Scans in which at least one rule of this criterion reported a result. */
  readonly evidenceIds: readonly string[];
}

export interface A11yConformanceReport {
  readonly wcagVersion: A11yWcagVersion;
  readonly level: A11yConformanceLevel;
  readonly scanCount: number;
  /** Scans recorded under a different version or level; they cannot vouch for this target. */
  readonly ignoredScanCount: number;
  readonly criteria: readonly CriterionConformance[];
  readonly counts: Readonly<Record<CriterionConformanceStatus, number>>;
}

interface RuleOutcomes {
  readonly violations: ReadonlySet<string>;
  readonly excepted: ReadonlySet<string>;
  readonly uncertain: ReadonlySet<string>;
  readonly passed: ReadonlySet<string>;
  readonly inapplicable: ReadonlySet<string>;
}

const RULE_OUTCOME_KEYS: readonly (keyof RuleOutcomes)[] = [
  'violations',
  'excepted',
  'uncertain',
  'passed',
  'inapplicable',
];

function collectRuleOutcomes(record: A11yScanRecord): RuleOutcomes {
  return {
    violations: new Set(record.violations.map((violation) => violation.id)),
    excepted: new Set(record.excepted.map((entry) => entry.ruleId)),
    uncertain: new Set(record.uncertain.map((entry) => entry.id)),
    passed: new Set(record.passedRuleIds),
    inapplicable: new Set(record.inapplicableRuleIds),
  };
}

function hasAny(ruleIds: ReadonlySet<string>, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => ruleIds.has(candidate));
}

function countStatus(criteria: readonly CriterionConformance[], status: CriterionConformanceStatus): number {
  return criteria.filter((entry) => entry.status === status).length;
}

/**
 * Per-criterion outcome for the configured target, from the scans recorded for it. A failure or an
 * accepted exception is reported as such whatever the criterion's coverage. Otherwise only a
 * criterion axe-core can fully decide (`automated`) may be `passed` or `not-applicable`: a rule
 * passing for a partly covered criterion proves nothing about the rest of it, and a criterion with
 * no scan behind it is unproven, so both stay `needs-manual-check` (AGENTS.md 12.5).
 */
export function buildA11yConformanceReport(
  target: WcagTarget,
  scans: readonly A11yScanInput[],
): A11yConformanceReport {
  const matching = scans.filter(
    ({ record }) => record.wcagVersion === target.wcagVersion && record.level === target.level,
  );
  const outcomes = matching.map((scan) => ({ scan, ruleOutcomes: collectRuleOutcomes(scan.record) }));

  const criteria = listApplicableCriteria(target).map((criterion): CriterionConformance => {
    const evidenceIds = outcomes
      .filter(({ ruleOutcomes }) =>
        RULE_OUTCOME_KEYS.some((key) => hasAny(ruleOutcomes[key], criterion.axeRuleIds)),
      )
      .map(({ scan }) => scan.evidenceId);
    const seen = (key: keyof RuleOutcomes): boolean =>
      outcomes.some(({ ruleOutcomes }) => hasAny(ruleOutcomes[key], criterion.axeRuleIds));

    let status: CriterionConformanceStatus = 'needs-manual-check';
    if (seen('violations')) {
      status = 'failed';
    } else if (seen('excepted')) {
      status = 'excepted';
    } else if (criterion.coverage === 'automated' && !seen('uncertain')) {
      if (seen('passed')) {
        status = 'passed';
      } else if (seen('inapplicable')) {
        status = 'not-applicable';
      }
    }
    return {
      criterionId: criterion.id,
      name: criterion.name,
      level: criterion.level,
      coverage: criterion.coverage,
      status,
      evidenceIds,
    };
  });

  return {
    wcagVersion: target.wcagVersion,
    level: target.level,
    scanCount: matching.length,
    ignoredScanCount: scans.length - matching.length,
    criteria,
    counts: {
      passed: countStatus(criteria, 'passed'),
      failed: countStatus(criteria, 'failed'),
      'needs-manual-check': countStatus(criteria, 'needs-manual-check'),
      'not-applicable': countStatus(criteria, 'not-applicable'),
      excepted: countStatus(criteria, 'excepted'),
    },
  };
}
