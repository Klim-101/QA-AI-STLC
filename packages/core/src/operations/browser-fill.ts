// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Evidence } from '@qa-ai-stlc/schemas';
import type { BrowserOperationContext } from './browser-context.js';
import { createBrowserEvidenceStore, registerBrowserAction } from './browser-evidence.js';

export interface BrowserFillOptions {
  readonly sessionId: string;
  readonly selector: string;
  readonly value: string;
}

export interface BrowserFillResult {
  readonly sessionId: string;
  readonly selector: string;
  /** How much was typed. The value itself never leaves the browser (AGENTS.md 5.8). */
  readonly valueLength: number;
  readonly url: string;
  readonly evidence: Evidence;
}

/**
 * MCP `qa.browser_fill` (P2-06): types into one field and registers the fill as evidence. The
 * record names the field and the length of what was typed, never the value: a password typed
 * into a login form must not survive in `.qa/` even though the evidence store's secret scanner
 * would probably have caught it — defense in depth (AGENTS.md 5.8, 12.4).
 */
export async function runBrowserFill(
  context: BrowserOperationContext,
  options: BrowserFillOptions,
): Promise<BrowserFillResult> {
  const session = await context.sessions.get(options.sessionId);
  const evidenceStore = createBrowserEvidenceStore(context.engine);

  await session.page.fill(options.selector, options.value);
  const url = session.page.url();

  const evidence = await registerBrowserAction({
    evidenceStore,
    evidenceId: context.sessions.nextEvidenceId(),
    session,
    now: context.engine.clock.now(),
    action: { type: 'fill', selector: options.selector, valueLength: options.value.length, url },
  });

  return {
    sessionId: session.sessionId,
    selector: options.selector,
    valueLength: options.value.length,
    url,
    evidence,
  };
}
