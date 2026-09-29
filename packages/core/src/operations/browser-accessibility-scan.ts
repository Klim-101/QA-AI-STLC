// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// axe-core is a CommonJS package with no named ESM exports; its Node entry sets `.source` (the
// bundled browser script, for exactly this "inject into a page" use case) as a property on its
// default-exported object, not a statically analyzable named export.
import axeCore from 'axe-core';
import type { Evidence } from '@qa-ai-stlc/schemas';
import type { BrowserOperationContext } from './browser-context.js';
import { createBrowserEvidenceStore, registerEvidenceOrThrow } from './browser-evidence.js';
import { loadConfig } from '../config-loader.js';
import { hashText } from '../hash.js';
import { toCanonicalJson } from '../json-file.js';
import {
  classifyAxeResult,
  listRuleIds,
  planAxeRun,
  toAxeContext,
  type AxeContext,
  type AxeRunPlan,
} from './a11y-scan-plan.js';

export interface BrowserAccessibilityScanOptions {
  readonly sessionId: string;
}

export interface BrowserAccessibilityScanResult {
  readonly sessionId: string;
  readonly url: string;
  readonly evidence: Evidence;
  /** Violations no active exception covers; a count, not a verdict — the case's expected result is interpreted by whoever executes it. */
  readonly violationCount: number;
  /** Violations an active configured exception covers; still listed in the evidence. */
  readonly exceptedCount: number;
  /** axe-core `incomplete` results that need manual review; never to be reported as passed. */
  readonly uncertainCount: number;
  readonly axeVersion: string;
  /** SHA-256 of the effective `a11y` configuration the scan ran with. */
  readonly configHash: string;
}

/**
 * Runs a real axe-core scan against the session's current page for the `a11y` test type (P3-14)
 * and registers the raw result as evidence. Injects axe-core's bundled browser source via
 * `addScriptTag` (a real Playwright `Page` method, ADR-0009's dependency-boundary constraint does
 * not apply to a port method that already exists on the real adapter) rather than a
 * `packages/explorer`-owned mechanism, since `packages/core` cannot import from `explorer`
 * (AGENTS.md 3).
 */
export async function runBrowserAccessibilityScan(
  context: BrowserOperationContext,
  options: BrowserAccessibilityScanOptions,
): Promise<BrowserAccessibilityScanResult> {
  const session = await context.sessions.get(options.sessionId);
  const evidenceStore = createBrowserEvidenceStore(context.engine);
  const { a11y } = await loadConfig(context.engine);
  const plan = planAxeRun(a11y);
  const configHash = hashText(toCanonicalJson(a11y));

  await session.page.addScriptTag({ content: axeCore.source });
  const scanResult = await session.page.evaluate(runAxeInPage, buildRunArgument(plan));
  const today = context.engine.clock.now().toISOString().slice(0, 10);
  const classified = classifyAxeResult(scanResult, a11y.exceptions, today);

  const url = session.page.url();
  const evidence = await registerEvidenceOrThrow(evidenceStore, {
    id: context.sessions.nextEvidenceId(),
    runId: session.runId,
    kind: 'other',
    fileExtension: 'json',
    content: toCanonicalJson({
      type: 'a11y-scan',
      axeVersion: axeCore.version,
      configHash,
      wcagVersion: a11y.wcagVersion,
      level: a11y.level,
      bestPractices: a11y.bestPractices,
      tags: plan.tags,
      include: plan.include,
      exclude: plan.exclude,
      violations: classified.violations,
      excepted: classified.excepted,
      expiredExceptions: classified.expiredExceptions,
      uncertain: classified.uncertain,
      passedRuleIds: listRuleIds(scanResult, 'passes'),
      inapplicableRuleIds: listRuleIds(scanResult, 'inapplicable'),
    }),
  });

  return {
    sessionId: session.sessionId,
    url,
    evidence,
    violationCount: classified.violations.length,
    exceptedCount: classified.excepted.length,
    uncertainCount: classified.uncertain.length,
    axeVersion: axeCore.version,
    configHash,
  };
}

interface AxeRunArgument {
  readonly context: AxeContext | undefined;
  readonly options: {
    readonly runOnly: { readonly type: 'tag'; readonly values: readonly string[] };
    readonly rules: Readonly<Record<string, { readonly enabled: true }>>;
  };
}

function buildRunArgument(plan: AxeRunPlan): AxeRunArgument {
  return {
    context: toAxeContext(plan),
    options: {
      runOnly: { type: 'tag', values: plan.tags },
      rules: Object.fromEntries(plan.ruleIds.map((ruleId) => [ruleId, { enabled: true as const }])),
    },
  };
}

// Runs inside the real browser's page context (a real `AuthPage.evaluate`, not this process),
// so Node-side coverage instrumentation never sees this callback execute even against a real
// page — the same class of gap `ports/process-runner.ts` already documents this way.
/* v8 ignore next 4 */
function runAxeInPage(argument: AxeRunArgument): Promise<unknown> {
  const { axe, document } = globalThis as unknown as {
    axe: { run: (...args: unknown[]) => Promise<unknown> };
    document: unknown;
  };
  return axe.run(argument.context ?? document, argument.options);
}
