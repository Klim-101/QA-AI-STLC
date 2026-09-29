// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  listA11yLevelsUpTo,
  type A11yConfig,
  type A11yConformanceLevel,
  type A11yWcagVersion,
} from '@qa-ai-stlc/schemas';
import { OPERABLE_CRITERIA } from './a11y-criteria/operable.js';
import { PERCEIVABLE_CRITERIA } from './a11y-criteria/perceivable.js';
import type { WcagCriterion } from './a11y-criteria/types.js';
import { UNDERSTANDABLE_ROBUST_CRITERIA } from './a11y-criteria/understandable-robust.js';
import { listRuleIds } from './operations/a11y-scan-plan.js';

export type { WcagCoverage, WcagCriterion } from './a11y-criteria/types.js';

/**
 * Success criteria of WCAG 2.0, 2.1 and 2.2 at all three levels, in criterion-number order.
 * Criterion numbers are the standard's identifiers; the names and checks are written for this
 * project rather than copied from the W3C text, so the catalogue does not depend on the terms
 * under which that text may be reproduced.
 */
export const WCAG_CRITERIA: readonly WcagCriterion[] = [
  ...PERCEIVABLE_CRITERIA,
  ...OPERABLE_CRITERIA,
  ...UNDERSTANDABLE_ROBUST_CRITERIA,
];

export type WcagTarget = Pick<A11yConfig, 'wcagVersion' | 'level'>;

const VERSIONS_ASCENDING: readonly A11yWcagVersion[] = ['2.0', '2.1', '2.2'];

function versionIndex(version: A11yWcagVersion): number {
  return VERSIONS_ASCENDING.indexOf(version);
}

/** Criteria a conformance claim for the target covers: the version's criteria up to the level. */
export function listApplicableCriteria(target: WcagTarget): readonly WcagCriterion[] {
  const levels = new Set<A11yConformanceLevel>(listA11yLevelsUpTo(target.level));
  const targetIndex = versionIndex(target.wcagVersion);
  return WCAG_CRITERIA.filter(
    (criterion) =>
      levels.has(criterion.level) &&
      versionIndex(criterion.since) <= targetIndex &&
      (criterion.removedIn === undefined || versionIndex(criterion.removedIn) > targetIndex),
  );
}

export interface ManualChecklistItem {
  readonly criterionId: string;
  readonly name: string;
  readonly level: A11yConformanceLevel;
  readonly coverage: 'partial' | 'manual';
  /** What the operator verifies by hand. */
  readonly check: string;
  /** Rules of this criterion axe-core could not decide in the scan. */
  readonly incompleteRuleIds: readonly string[];
}

export interface ManualChecklist {
  /** Every in-scope criterion axe-core cannot fully decide. */
  readonly items: readonly ManualChecklistItem[];
  /**
   * Automated criteria for which axe-core still returned an `incomplete` rule: not on the
   * checklist, but a pass must not be assumed for them either.
   */
  readonly undecidedAutomatedCriterionIds: readonly string[];
}

/**
 * The manual checklist for a target: exactly the in-scope criteria whose axe-core coverage is
 * not `automated`. A scan result only annotates it; a clean scan never removes an item, because
 * a passing partial rule does not establish the criterion.
 */
export function buildManualChecklist(target: WcagTarget, scanResult?: unknown): ManualChecklist {
  const incomplete = new Set(scanResult === undefined ? [] : listRuleIds(scanResult, 'incomplete'));
  const items: ManualChecklistItem[] = [];
  const undecidedAutomatedCriterionIds: string[] = [];
  for (const criterion of listApplicableCriteria(target)) {
    const incompleteRuleIds = criterion.axeRuleIds.filter((ruleId) => incomplete.has(ruleId));
    if (criterion.coverage === 'automated') {
      if (incompleteRuleIds.length > 0) {
        undecidedAutomatedCriterionIds.push(criterion.id);
      }
      continue;
    }
    items.push({
      criterionId: criterion.id,
      name: criterion.name,
      level: criterion.level,
      coverage: criterion.coverage,
      check: criterion.manualCheck,
      incompleteRuleIds,
    });
  }
  return { items, undecidedAutomatedCriterionIds };
}
