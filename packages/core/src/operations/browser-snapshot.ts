// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Evidence } from '@qa-ai-stlc/schemas';
import type { SessionNotice } from '../browser-session-store.js';
import { collectNotices } from '../browser-tabs.js';
import { toCanonicalJson } from '../json-file.js';
import type { BrowserOperationContext } from './browser-context.js';
import { createElementRefTable } from '../element-refs.js';
import { renderPageView, type PageView } from '../page-view.js';
import { createBrowserEvidenceStore, registerEvidenceOrThrow } from './browser-evidence.js';

export interface BrowserSnapshotOptions {
  readonly sessionId: string;
  /** Also captures a PNG; off by default, because the compact view is what an agent reads. */
  readonly screenshot?: boolean;
  /** Only meaningful with `screenshot`. */
  readonly fullPage?: boolean;
}

export interface BrowserSnapshotResult {
  readonly sessionId: string;
  readonly url: string;
  readonly title: string;
  readonly view: PageView;
  readonly screenshot?: Evidence;
  readonly accessibilityTree: Evidence;
  /** Dialogs and pages that appeared since a result last reported them (P6-59): page-controlled text, untrusted. */
  readonly notices?: SessionNotice[];
}

/**
 * MCP `qa.browser_snapshot` (P2-06, P6-52): returns the page as a compact, capped outline with a
 * ref on every actionable node, and registers the full accessibility tree as evidence before
 * returning. A screenshot is taken, and registered, only when asked for. There is no path from a
 * tool call to a stored file that the engine did not hash and record (ADR-005).
 *
 * The registered tree is the page's own, unshaped report: the outline is a bounded reading
 * aid, while the evidence is the record of one moment.
 */
export async function runBrowserSnapshot(
  context: BrowserOperationContext,
  options: BrowserSnapshotOptions,
): Promise<BrowserSnapshotResult> {
  const session = await context.sessions.get(options.sessionId);
  const evidenceStore = createBrowserEvidenceStore(context.engine);
  const capturedAt = context.engine.clock.now().toISOString();

  const image =
    options.screenshot === true
      ? await session.page.screenshot(options.fullPage === undefined ? {} : { fullPage: options.fullPage })
      : undefined;
  const url = session.page.url();

  const screenshot =
    image === undefined
      ? undefined
      : await registerEvidenceOrThrow(evidenceStore, {
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

  const view = renderPageView(tree, undefined, session.nextRefNumber);
  context.sessions.setElementRefs(session.sessionId, createElementRefTable(url, view.refs));

  return {
    sessionId: session.sessionId,
    url,
    title: await session.page.title(),
    view,
    ...(screenshot === undefined ? {} : { screenshot }),
    accessibilityTree,
    ...(await collectNotices(context, session)),
  };
}
