// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Evidence } from '@qa-ai-stlc/schemas';
import { toCanonicalJson } from '../json-file.js';
import type { BrowserOperationContext } from './browser-context.js';
import { createBrowserEvidenceStore, registerEvidenceOrThrow } from './browser-evidence.js';

export interface BrowserSnapshotOptions {
  readonly sessionId: string;
  readonly fullPage?: boolean;
}

export interface BrowserSnapshotResult {
  readonly sessionId: string;
  readonly url: string;
  readonly title: string;
  readonly screenshot: Evidence;
  readonly accessibilityTree: Evidence;
}

/**
 * MCP `qa.browser_snapshot` (P2-06): captures the page twice — a PNG and its accessibility tree
 * — and registers both before returning. There is no path from a tool call to a screenshot that
 * the engine did not hash and record, which is the acceptance criterion of ADR-005.
 *
 * The tree is stored as Playwright reports it, without the normalization and capping
 * `@qa-ai-stlc/explorer` applies when building a selector registry: that shaping exists to make
 * crawl output comparable across pages, and an exploratory snapshot is a record of one moment,
 * not an input to a diff. Core also must not depend on explorer (AGENTS.md 3).
 */
export async function runBrowserSnapshot(
  context: BrowserOperationContext,
  options: BrowserSnapshotOptions,
): Promise<BrowserSnapshotResult> {
  const session = await context.sessions.get(options.sessionId);
  const evidenceStore = createBrowserEvidenceStore(context.engine);
  const capturedAt = context.engine.clock.now().toISOString();

  const image = await session.page.screenshot(
    options.fullPage === undefined ? {} : { fullPage: options.fullPage },
  );
  const url = session.page.url();

  const screenshot = await registerEvidenceOrThrow(evidenceStore, {
    id: context.sessions.nextEvidenceId(),
    runId: session.runId,
    kind: 'screenshot',
    content: image,
  });

  // "other" rather than "action": the tree is captured page state, the structural counterpart of
  // the screenshot, not a description of something the engine did.
  const tree = await session.page.ariaSnapshotJSON();
  const accessibilityTree = await registerEvidenceOrThrow(evidenceStore, {
    id: context.sessions.nextEvidenceId(),
    runId: session.runId,
    kind: 'other',
    fileExtension: 'json',
    content: toCanonicalJson({ sessionId: session.sessionId, url, capturedAt, tree }),
  });

  return {
    sessionId: session.sessionId,
    url,
    title: await session.page.title(),
    screenshot,
    accessibilityTree,
  };
}
