// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Evidence, EvidenceKind } from '@qa-ai-stlc/schemas';
import type { EventLog } from '../browser-event-log.js';
import type { BrowserSession } from '../browser-session-store.js';
import { toCanonicalJson } from '../json-file.js';
import { truncateText } from '../normalize.js';
import type { BrowserOperationContext } from './browser-context.js';
import { createBrowserEvidenceStore, registerEvidenceOrThrow } from './browser-evidence.js';

/** Entries returned by one call when `limit` is not given, and the most any call returns. */
export const DEFAULT_LOG_READ_LIMIT = 50;
export const MAX_LOG_READ_LIMIT = 100;

export interface LogReadOptions {
  readonly sessionId: string;
  /** The `cursor` an earlier call returned; omit to read from the start of what the session kept. */
  readonly since?: number;
  readonly limit?: number;
  /** Only console errors and warnings, or only requests that failed or got an error status. */
  readonly errorsOnly?: boolean;
  /** `'step-<N>'`, `N` the case step's 1-based position, during an interactive execution session (P3-15). */
  readonly stepId?: string;
}

export interface LogReadResult<TEntry> {
  readonly sessionId: string;
  /** Matching entries after `since`, oldest first, at most `limit`, each text capped. */
  readonly entries: TEntry[];
  /** Matching entries after `since` that are not in `entries` because of `limit`. */
  readonly omittedCount: number;
  /** Events after `since` the session had already dropped because its log was full. */
  readonly missedCount: number;
  /** Pass as `since` to read on from here. */
  readonly cursor: number;
  /** The full redacted log after `since`, unfiltered and uncapped, as registered evidence. */
  readonly evidence: Evidence;
}

export interface LogReadSpec<TEntry extends { readonly seq: number }> {
  /** Names the log in the evidence content. */
  readonly name: 'console' | 'network';
  readonly kind: EvidenceKind;
  readonly selectLog: (session: BrowserSession) => EventLog<TEntry>;
  readonly isError: (entry: TEntry) => boolean;
  /** Caps the page-controlled text of one entry for the result. */
  readonly cap: (entry: TEntry) => TEntry;
}

/** The text of a result entry is cut shorter than what the evidence keeps. */
export function capResultText(text: string): string {
  return truncateText(text).text;
}

/**
 * Reads what a session saw the page log or request since a cursor and registers the redacted log
 * as evidence before returning. What is returned is a compact, capped, filtered view of it; the
 * evidence is the record.
 */
export async function readSessionLog<TEntry extends { readonly seq: number }>(
  context: BrowserOperationContext,
  options: LogReadOptions,
  spec: LogReadSpec<TEntry>,
): Promise<LogReadResult<TEntry>> {
  const session = await context.sessions.get(options.sessionId);
  const since = options.since ?? 0;
  const slice = spec.selectLog(session).read(since);
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LOG_READ_LIMIT, 1), MAX_LOG_READ_LIMIT);
  const matching = options.errorsOnly === true ? slice.entries.filter(spec.isError) : slice.entries;
  const returned = matching.slice(0, limit);
  const omittedCount = matching.length - returned.length;
  const lastReturned = returned.at(-1);
  // A read cut by `limit` continues exactly where it stopped; otherwise it is caught up with the log.
  const cursor = lastReturned !== undefined && omittedCount > 0 ? lastReturned.seq : slice.latestSeq;

  const evidence = await registerEvidenceOrThrow(createBrowserEvidenceStore(context.engine), {
    id: context.sessions.nextEvidenceId(),
    runId: session.runId,
    kind: spec.kind,
    fileExtension: 'json',
    content: toCanonicalJson({
      sessionId: session.sessionId,
      log: spec.name,
      capturedAt: context.engine.clock.now().toISOString(),
      since,
      missedCount: slice.missedCount,
      entries: slice.entries,
    }),
    ...(options.stepId !== undefined ? { stepId: options.stepId } : {}),
  });

  return {
    sessionId: session.sessionId,
    entries: returned.map(spec.cap),
    omittedCount,
    missedCount: slice.missedCount,
    cursor,
    evidence,
  };
}
