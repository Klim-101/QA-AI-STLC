// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import axeCore from 'axe-core';
import {
  listA11yLevelsUpTo,
  type A11yConfig,
  type A11yException,
  type A11yScanRecord,
} from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { QaError } from '../errors.js';

export interface AxeRunPlan {
  readonly tags: readonly string[];
  /** Rule ids the scan must run; AAA rules are off by default in axe-core and need enabling. */
  readonly ruleIds: readonly string[];
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

export interface AxeContext {
  readonly include?: readonly (readonly string[])[];
  readonly exclude?: readonly (readonly string[])[];
}

export interface ExceptedViolation {
  readonly ruleId: string;
  readonly reason: string;
  readonly expires?: string;
  readonly violation: unknown;
}

export interface ClassifiedAxeResult {
  /** Violations no active exception covers. */
  readonly violations: readonly unknown[];
  readonly excepted: readonly ExceptedViolation[];
  /** Exceptions past their expiry: reported so a lapsed acceptance is visible, never silently applied. */
  readonly expiredExceptions: readonly A11yException[];
  /** axe-core `incomplete` results: needs manual review, so never reported as passed. */
  readonly uncertain: readonly unknown[];
}

// axe-core tags a WCAG rule with the version and level together: `wcag2aa` (2.0), `wcag21aa` (2.1),
// `wcag22aa` (2.2). Versions and levels are both cumulative, so a 2.1 AA target covers the 2.0
// tags too. A combination axe-core has no rule for (there is no `wcag21aaa`) is dropped below.
const TAG_PREFIX_BY_VERSION = { '2.0': 'wcag2', '2.1': 'wcag21', '2.2': 'wcag22' } as const;
const VERSIONS_ASCENDING = ['2.0', '2.1', '2.2'] as const;

export function planAxeRun(config: A11yConfig): AxeRunPlan {
  const knownTags = new Set(axeCore.getRules().flatMap((rule) => rule.tags));
  const versions = VERSIONS_ASCENDING.slice(0, VERSIONS_ASCENDING.indexOf(config.wcagVersion) + 1);
  const wcagTags = versions.flatMap((version) =>
    listA11yLevelsUpTo(config.level).map(
      (level) => `${TAG_PREFIX_BY_VERSION[version]}${level.toLowerCase()}`,
    ),
  );
  const tags = [
    ...wcagTags.filter((tag) => knownTags.has(tag)),
    ...(config.bestPractices ? ['best-practice'] : []),
  ];
  return {
    tags,
    ruleIds: axeCore.getRules(tags).map((rule) => rule.ruleId),
    include: config.include,
    exclude: config.exclude,
  };
}

/**
 * axe-core's `run` context argument, or `undefined` for the whole document: axe-core rejects an
 * empty context object, so "no narrowing" cannot be expressed as `{}`.
 */
export function toAxeContext(plan: AxeRunPlan): AxeContext | undefined {
  if (plan.include.length === 0 && plan.exclude.length === 0) {
    return undefined;
  }
  return {
    ...(plan.include.length > 0 ? { include: plan.include.map((selector) => [selector]) } : {}),
    ...(plan.exclude.length > 0 ? { exclude: plan.exclude.map((selector) => [selector]) } : {}),
  };
}

type AxeResultKey = 'violations' | 'incomplete' | 'passes' | 'inapplicable';

function readEntries(scanResult: unknown, key: AxeResultKey): readonly unknown[] {
  if (typeof scanResult !== 'object' || scanResult === null || !(key in scanResult)) {
    return [];
  }
  const entries = (scanResult as Record<string, unknown>)[key];
  return Array.isArray(entries) ? (entries as unknown[]) : [];
}

function readRuleId(entry: unknown): string | undefined {
  if (typeof entry !== 'object' || entry === null || !('id' in entry)) {
    return undefined;
  }
  return typeof entry.id === 'string' ? entry.id : undefined;
}

/** `expires` is an inclusive ISO date, so an exception still applies on its expiry day. */
function isActive(exception: A11yException, today: string): boolean {
  return exception.expires === undefined || today <= exception.expires;
}

/** The distinct rule ids axe-core reported under one result key (`incomplete`, `passes`, ...). */
export function listRuleIds(scanResult: unknown, key: AxeResultKey): readonly string[] {
  const ruleIds = readEntries(scanResult, key).flatMap((entry) => readRuleId(entry) ?? []);
  return [...new Set(ruleIds)];
}

export function classifyAxeResult(
  scanResult: unknown,
  exceptions: readonly A11yException[],
  today: string,
): ClassifiedAxeResult {
  const activeByRuleId = new Map<string, A11yException>();
  for (const exception of exceptions.filter((candidate) => isActive(candidate, today))) {
    if (!activeByRuleId.has(exception.ruleId)) {
      activeByRuleId.set(exception.ruleId, exception);
    }
  }

  const violations: unknown[] = [];
  const excepted: ExceptedViolation[] = [];
  for (const violation of readEntries(scanResult, 'violations')) {
    const ruleId = readRuleId(violation);
    const exception = ruleId === undefined ? undefined : activeByRuleId.get(ruleId);
    if (ruleId === undefined || exception === undefined) {
      violations.push(violation);
      continue;
    }
    excepted.push({
      ruleId,
      reason: exception.reason,
      ...(exception.expires === undefined ? {} : { expires: exception.expires }),
      violation,
    });
  }

  return {
    violations,
    excepted,
    expiredExceptions: exceptions.filter((exception) => !isActive(exception, today)),
    uncertain: readEntries(scanResult, 'incomplete'),
  };
}

// The fields of a real `axe.run` result the engine relies on. axe-core always returns all four
// result lists, its own `testEngine` and the options it ran with, so a `{}` or a hand-written
// stand-in cannot pass as a completed scan. Entries stay open: the rest of a result is evidence.
const AxeEntrySchema = z.looseObject({ id: z.string().min(1) });
const AxeResultSchema = z.looseObject({
  testEngine: z.looseObject({ name: z.literal('axe-core'), version: z.string().min(1) }),
  url: z.string().min(1),
  toolOptions: z.looseObject({ runOnly: z.looseObject({ values: z.array(z.string()) }) }),
  violations: z.array(AxeEntrySchema),
  incomplete: z.array(AxeEntrySchema),
  passes: z.array(AxeEntrySchema),
  inapplicable: z.array(AxeEntrySchema),
});

/**
 * Validates a raw axe-core result and checks it ran the rule tags the plan asked for. The tags are
 * the only part of the plan axe-core echoes back, so they are the evidence the configuration was
 * applied rather than assumed.
 */
export function parseAxeResult(raw: unknown, plan: AxeRunPlan): z.infer<typeof AxeResultSchema> {
  const parsed = AxeResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new QaError(
      'A11Y_SCAN_RESULT_INVALID',
      `The accessibility scan result is not a complete axe-core result: ${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ')}`,
      {
        remediation:
          'Produce the result with `scanAccessibility(page, testInfo)` or the engine scan tool, which run axe-core itself.',
      },
    );
  }
  const ranTags = [...parsed.data.toolOptions.runOnly.values].sort();
  const plannedTags = [...plan.tags].sort();
  if (ranTags.length !== plannedTags.length || ranTags.some((tag, index) => tag !== plannedTags[index])) {
    throw new QaError(
      'A11Y_SCAN_CONFIG_MISMATCH',
      `The scan ran rule tags [${ranTags.join(', ')}] but the configured accessibility target needs [${plannedTags.join(', ')}].`,
      {
        remediation:
          'Re-run the scan after the accessibility configuration is final; do not reuse a result produced under another target.',
      },
    );
  }
  return parsed.data;
}

export interface BuildA11yScanRecordOptions {
  readonly a11y: A11yConfig;
  readonly plan: AxeRunPlan;
  readonly axeVersion: string;
  /** SHA-256 of the effective `a11y` configuration the scan ran with. */
  readonly configHash: string;
  readonly scanResult: unknown;
  /** ISO date (`YYYY-MM-DD`) an exception's expiry is compared with. */
  readonly today: string;
}

/**
 * The `a11y-scan` evidence body for one axe-core result, shared by the interactive scan and the
 * `a11y` runner so both record exactly what the scan ran with and how each rule was classified.
 */
export function buildA11yScanRecord(
  options: BuildA11yScanRecordOptions,
): Omit<A11yScanRecord, 'schemaVersion'> {
  const { a11y, plan } = options;
  const scanResult = parseAxeResult(options.scanResult, plan);
  const classified = classifyAxeResult(scanResult, a11y.exceptions, options.today);
  return {
    type: 'a11y-scan',
    axeVersion: options.axeVersion,
    configHash: options.configHash,
    wcagVersion: a11y.wcagVersion,
    level: a11y.level,
    bestPractices: a11y.bestPractices,
    tags: [...plan.tags],
    include: [...plan.include],
    exclude: [...plan.exclude],
    violations: classified.violations as A11yScanRecord['violations'],
    excepted: [...classified.excepted],
    expiredExceptions: [...classified.expiredExceptions],
    uncertain: classified.uncertain as A11yScanRecord['uncertain'],
    passedRuleIds: [...listRuleIds(scanResult, 'passes')],
    inapplicableRuleIds: [...listRuleIds(scanResult, 'inapplicable')],
  };
}
