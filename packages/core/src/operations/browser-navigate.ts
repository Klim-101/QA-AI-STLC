// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Evidence } from '@qa-ai-stlc/schemas';
import { assertUrlAllowed } from '../browser-allowlist.js';
import type { BrowserOperationContext } from './browser-context.js';
import { createBrowserEvidenceStore, registerBrowserAction } from './browser-evidence.js';

export interface BrowserNavigateOptions {
  readonly sessionId: string;
  readonly url: string;
}

export interface BrowserNavigateResult {
  readonly sessionId: string;
  /** Where the page actually ended up, which a redirect can make differ from the requested URL. */
  readonly url: string;
  readonly title: string;
  readonly httpStatus?: number;
  readonly evidence: Evidence;
}

/**
 * MCP `qa.browser_navigate` (P2-06): navigates an open session and registers the navigation as
 * evidence. The target is checked against the session's allowlist before anything is requested,
 * so an off-scope host is never contacted at all (AGENTS.md 12.4).
 */
export async function runBrowserNavigate(
  context: BrowserOperationContext,
  options: BrowserNavigateOptions,
): Promise<BrowserNavigateResult> {
  const session = await context.sessions.get(options.sessionId);
  assertUrlAllowed(options.url, session.allowlist);

  const evidenceStore = createBrowserEvidenceStore(context.engine);
  const response = await session.page.goto(options.url);
  const httpStatus = response === null ? undefined : response.status();
  const url = session.page.url();

  const evidence = await registerBrowserAction({
    evidenceStore,
    evidenceId: context.sessions.nextEvidenceId(),
    session,
    now: context.engine.clock.now(),
    action: { type: 'navigate', url, ...(httpStatus !== undefined ? { httpStatus } : {}) },
  });

  return {
    sessionId: session.sessionId,
    url,
    title: await session.page.title(),
    ...(httpStatus !== undefined ? { httpStatus } : {}),
    evidence,
  };
}
