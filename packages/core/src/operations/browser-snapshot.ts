// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Evidence } from '@qa-ai-stlc/schemas';
import type { SessionNotice } from '../browser-session-store.js';
import { collectNotices } from '../browser-tabs.js';
import { toCanonicalJson } from '../json-file.js';
import type { BrowserOperationContext } from './browser-context.js';
import { createElementRefTable } from '../element-refs.js';
import { QaError } from '../errors.js';
import {
  diffPageViews,
  renderPageView,
  type InheritedRefs,
  type PageView,
  type PageViewEntry,
} from '../page-view.js';
import { createBrowserEvidenceStore, registerEvidenceOrThrow } from './browser-evidence.js';

export interface BrowserSnapshotOptions {
  readonly sessionId: string;
  /** Also captures a PNG; off by default, because the compact view is what an agent reads. */
  readonly screenshot?: boolean;
  /** Only meaningful with `screenshot`. */
  readonly fullPage?: boolean;
  /**
   * The `snapshotId` of an earlier snapshot of this session. The view then holds only the lines
   * added or removed since it, and unchanged elements keep the refs they had.
   */
  readonly since?: string;
}

/** The counts behind a snapshot diff; the changed lines themselves are in `view`. */
export interface BrowserSnapshotDiff {
  readonly since: string;
  readonly addedCount: number;
  readonly removedCount: number;
  readonly unchangedCount: number;
}

export interface BrowserSnapshotResult {
  readonly sessionId: string;
  /** Pass this as `since` to a later snapshot to get only what changed. */
  readonly snapshotId: string;
  /** Present when `since` was given; `view` then holds the changed lines only. */
  readonly diff?: BrowserSnapshotDiff;
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
  // Checked before anything is captured: a bad id must cost nothing and register nothing.
  const comparison =
    options.since === undefined
      ? undefined
      : { since: options.since, entries: recallEarlierSnapshot(context, session.sessionId, options.since) };
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

  const view = renderPageView(
    tree,
    undefined,
    session.nextRefNumber,
    comparison === undefined ? undefined : inheritRefs(comparison.entries),
  );
  context.sessions.setElementRefs(session.sessionId, createElementRefTable(url, view.refs));
  context.sessions.rememberSnapshot(session.sessionId, accessibilityTree.id, view.entries);
  const diff = comparison === undefined ? undefined : diffPageViews(comparison.entries, view.entries);

  return {
    sessionId: session.sessionId,
    url,
    title: await session.page.title(),
    snapshotId: accessibilityTree.id,
    view:
      diff === undefined
        ? view
        : { ...view, text: diff.text, truncated: diff.truncated, omittedLineCount: diff.omittedLineCount },
    ...(comparison === undefined || diff === undefined
      ? {}
      : {
          diff: {
            since: comparison.since,
            addedCount: diff.addedCount,
            removedCount: diff.removedCount,
            unchangedCount: diff.unchangedCount,
          },
        }),
    ...(screenshot === undefined ? {} : { screenshot }),
    accessibilityTree,
    ...(await collectNotices(context, session)),
  };
}

function recallEarlierSnapshot(
  context: BrowserOperationContext,
  sessionId: string,
  snapshotId: string,
): readonly PageViewEntry[] {
  const earlier = context.sessions.recallSnapshot(sessionId, snapshotId);
  if (earlier === undefined) {
    throw new QaError('BROWSER_SNAPSHOT_UNKNOWN', `This session has no remembered snapshot "${snapshotId}"`, {
      remediation:
        'Use the snapshotId of a snapshot taken in this session (only the latest few are kept), or take a full snapshot without "since".',
    });
  }
  return earlier;
}

function inheritRefs(entries: readonly PageViewEntry[]): InheritedRefs {
  const byKey = new Map<string, NonNullable<PageViewEntry['ref']>[]>();
  for (const entry of entries) {
    if (entry.ref !== undefined) {
      byKey.set(entry.key, [...(byKey.get(entry.key) ?? []), entry.ref]);
    }
  }
  return byKey;
}
