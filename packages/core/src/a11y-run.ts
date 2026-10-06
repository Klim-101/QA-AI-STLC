// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import axeCore from 'axe-core';
import { RunResultSchema, type A11yConfig, type RunResultStatus } from '@qa-ai-stlc/schemas';
import {
  A11Y_SCAN_ATTACHMENT_CONTENT_TYPE,
  A11Y_SCAN_ENVIRONMENT_VARIABLE,
  ensureA11yScanModule,
  resolveAxeSourcePath,
  serializeA11yScanPlan,
} from './a11y-scan-module.js';
import { loadConfig } from './config-loader.js';
import type { EngineContext } from './engine-context.js';
import { QaError } from './errors.js';
import { hashText } from './hash.js';
import { toCanonicalJson } from './json-file.js';
import { buildA11yScanRecord, planAxeRun, type AxeRunPlan } from './operations/a11y-scan-plan.js';
import type { RunnerEvidence, RunnerOutcome } from './runner.js';

/** What an `a11y` run needs before and after its specs execute; built once per run. */
export interface A11yRunPreparation {
  /** The scan plan for the spec process; set on that process only. */
  readonly environment: Readonly<Record<string, string>>;
  /** Attachment content type to the evidence kind the scan result is registered under. */
  readonly evidenceKindsByContentType: Readonly<Record<string, 'other'>>;
  readonly a11y: A11yConfig;
  readonly plan: AxeRunPlan;
  readonly configHash: string;
}

/**
 * Resolves the effective `a11y` configuration into the axe-core plan a spec's `scanAccessibility`
 * helper runs, and makes sure the helper module exists. The spec never sees the configuration,
 * so a spec cannot choose a lighter scan than the project asked for.
 */
export async function prepareA11yRun(engine: EngineContext): Promise<A11yRunPreparation> {
  const { a11y } = await loadConfig(engine);
  const plan = planAxeRun(a11y);
  await ensureA11yScanModule(engine);
  return {
    environment: { [A11Y_SCAN_ENVIRONMENT_VARIABLE]: serializeA11yScanPlan(plan, resolveAxeSourcePath()) },
    evidenceKindsByContentType: { [A11Y_SCAN_ATTACHMENT_CONTENT_TYPE]: 'other' },
    a11y,
    plan,
    configHash: hashText(toCanonicalJson(a11y)),
  };
}

function parseRawScan(content: string | Uint8Array): unknown {
  const text = typeof content === 'string' ? content : Buffer.from(content).toString('utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new QaError(
      'RUNNER_A11Y_RESULT_INVALID',
      'An accessibility scan attached a result that is not JSON.',
      {
        cause: error,
        remediation:
          'Call `scanAccessibility(page, testInfo)` from tests/qa/a11y-scan.ts instead of attaching a result by hand.',
      },
    );
  }
}

function describeFailure(ruleIds: readonly string[], a11y: A11yConfig): string {
  const count =
    ruleIds.length === 1 ? '1 accessibility rule' : `${String(ruleIds.length)} accessibility rules`;
  return `${count} violated (WCAG ${a11y.wcagVersion} ${a11y.level}): ${ruleIds.join(', ')}.`;
}

/**
 * Turns one Playwright outcome of an `a11y` spec into the engine's own: each raw axe-core result
 * the spec attached becomes an `a11y-scan` evidence record (exceptions applied, `incomplete`
 * results kept as `uncertain`), and a test Playwright considers passed takes the status the scans
 * support. A spec that passed without scanning anything proves nothing, so it is rejected.
 * Statuses other than `passed` come from Playwright unchanged: a scan never overrides an honest
 * `failed`, `blocked`, `skipped` or `partial`.
 */
export function finalizeA11yOutcome(
  outcome: RunnerOutcome,
  preparation: A11yRunPreparation,
  today: string,
): RunnerOutcome {
  const evidence: RunnerEvidence[] = [];
  const violatedRuleIds = new Set<string>();
  let scanCount = 0;
  let uncertainCount = 0;

  for (const item of outcome.evidence) {
    if (item.kind !== 'other') {
      evidence.push(item);
      continue;
    }
    const record = buildA11yScanRecord({
      a11y: preparation.a11y,
      plan: preparation.plan,
      axeVersion: axeCore.version,
      configHash: preparation.configHash,
      scanResult: parseRawScan(item.content),
      today,
    });
    scanCount += 1;
    uncertainCount += record.uncertain.length;
    record.violations.forEach((violation) => violatedRuleIds.add(violation.id));
    evidence.push({ ...item, content: toCanonicalJson(record) });
  }

  const { result } = outcome;
  if (result.status !== 'passed') {
    return { result, evidence };
  }
  if (scanCount === 0) {
    throw new QaError(
      'RUNNER_A11Y_NO_SCAN',
      `Accessibility test case "${result.testCaseId}" passed without scanning a page.`,
      {
        remediation:
          "Call `scanAccessibility(page, testInfo)` from tests/qa/a11y-scan.ts after navigating, so the case's result is backed by an accessibility scan.",
      },
    );
  }

  const status: RunResultStatus =
    violatedRuleIds.size > 0 ? 'failed' : uncertainCount > 0 ? 'uncertain' : 'passed';
  return {
    result: RunResultSchema.parse({
      ...result,
      status,
      ...(status === 'failed'
        ? { failure: { message: describeFailure([...violatedRuleIds].sort(), preparation.a11y) } }
        : {}),
    }),
    evidence,
  };
}
