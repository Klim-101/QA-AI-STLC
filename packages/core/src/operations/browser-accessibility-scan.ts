// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// axe-core is a CommonJS package with no named ESM exports; its Node entry sets `.source` (the
// bundled browser script, for exactly this "inject into a page" use case) as a property on its
// default-exported object, not a statically analyzable named export.
import axeCore from 'axe-core';
import type { Evidence } from '@qa-ai-stlc/schemas';
import type { BrowserOperationContext } from './browser-context.js';
import { createBrowserEvidenceStore, registerEvidenceOrThrow } from './browser-evidence.js';
import { toCanonicalJson } from '../json-file.js';

export interface BrowserAccessibilityScanOptions {
  readonly sessionId: string;
}

export interface BrowserAccessibilityScanResult {
  readonly sessionId: string;
  readonly url: string;
  readonly evidence: Evidence;
  /** A count, not a verdict — the case's expected result is interpreted by whoever executes it. */
  readonly violationCount: number;
}

function countViolations(scanResult: unknown): number {
  if (typeof scanResult === 'object' && scanResult !== null && 'violations' in scanResult) {
    const { violations } = scanResult;
    return Array.isArray(violations) ? violations.length : 0;
  }
  return 0;
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

  await session.page.addScriptTag({ content: axeCore.source });
  // Runs inside the real browser's page context (a real `AuthPage.evaluate`, not this process),
  // so Node-side coverage instrumentation never sees this callback execute even against a real
  // page — the same class of gap `ports/process-runner.ts` already documents this way.
  /* v8 ignore next */
  const runAxe = () => (globalThis as unknown as { axe: { run: () => Promise<unknown> } }).axe.run();
  const scanResult = await session.page.evaluate(runAxe);

  const url = session.page.url();
  const evidence = await registerEvidenceOrThrow(evidenceStore, {
    id: context.sessions.nextEvidenceId(),
    runId: session.runId,
    kind: 'other',
    fileExtension: 'json',
    content: toCanonicalJson(scanResult),
  });

  return { sessionId: session.sessionId, url, evidence, violationCount: countViolations(scanResult) };
}
