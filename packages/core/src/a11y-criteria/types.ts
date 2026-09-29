// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { A11yConformanceLevel, A11yWcagVersion } from '@qa-ai-stlc/schemas';

/**
 * How far axe-core alone can decide a criterion: `automated` means its rules check the whole
 * requirement, `partial` means they catch some failures but a pass proves nothing, `manual`
 * means no rule applies.
 */
export type WcagCoverage = 'automated' | 'partial' | 'manual';

interface WcagCriterionBase {
  /** Criterion number, for example `1.4.3`. */
  readonly id: string;
  /** Project-written short name; not the W3C title. */
  readonly name: string;
  readonly level: A11yConformanceLevel;
  /** First WCAG version that contains the criterion. */
  readonly since: A11yWcagVersion;
  /** First WCAG version that no longer contains the criterion. */
  readonly removedIn?: A11yWcagVersion;
  /** axe-core rules that report on this criterion. */
  readonly axeRuleIds: readonly string[];
}

export type WcagCriterion = WcagCriterionBase &
  (
    | { readonly coverage: 'automated'; readonly manualCheck?: never }
    | {
        readonly coverage: 'partial' | 'manual';
        /** What the operator verifies by hand, beyond what the axe-core rules cover. */
        readonly manualCheck: string;
      }
  );
