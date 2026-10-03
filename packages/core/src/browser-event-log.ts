// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { truncateText } from './normalize.js';
import { redactSecrets } from './secret-scan.js';

/** How many console messages and requests a session keeps; the oldest are dropped first. */
export const MAX_LOGGED_EVENTS = 500;

/** The longest text kept for one console message or one failure, before it is stored. */
export const MAX_LOGGED_TEXT_CHARS = 500;

export interface ConsoleLogEntry {
  readonly seq: number;
  readonly tabId: string;
  /** The browser's own level: `log`, `info`, `warning`, `error`, `debug`, or `pageerror` for an uncaught exception. */
  readonly level: string;
  /** Page-controlled text, redacted of secret shapes and capped: untrusted. */
  readonly text: string;
}

export interface NetworkLogEntry {
  readonly seq: number;
  readonly tabId: string;
  readonly method: string;
  /** Present when a response arrived. */
  readonly status?: number;
  /** Present when the request failed before a response (`net::ERR_FAILED`, aborted by safe mode). */
  readonly failure?: string;
  /** Origin, path with identifiers templated, and the names of the query parameters; no values. */
  readonly url: string;
}

/** What `EventLog.read` returns for one cursor. */
export interface EventLogSlice<TEntry> {
  /** Everything kept after the cursor, oldest first. */
  readonly entries: readonly TEntry[];
  /** Events after the cursor that were dropped because the log was full. */
  readonly missedCount: number;
  /** The sequence number of the newest event, whether or not it is in `entries`. */
  readonly latestSeq: number;
}

/**
 * A bounded, append-only log whose entries carry a sequence number. A caller keeps the sequence
 * number it last saw as a cursor, so "since a point in time" survives the log dropping old entries
 * instead of silently shifting.
 */
export class EventLog<TEntry extends { readonly seq: number }> {
  private entries: TEntry[] = [];
  private latestSeq = 0;

  constructor(private readonly capacity: number = MAX_LOGGED_EVENTS) {}

  /** Appends an event, giving it the next sequence number. */
  append(build: (seq: number) => TEntry): void {
    this.latestSeq += 1;
    this.entries.push(build(this.latestSeq));
    if (this.entries.length > this.capacity) {
      this.entries = this.entries.slice(-this.capacity);
    }
  }

  read(since: number): EventLogSlice<TEntry> {
    const entries = this.entries.filter((entry) => entry.seq > since);
    const oldestKept = this.entries[0]?.seq ?? this.latestSeq + 1;
    return {
      entries,
      missedCount: Math.max(0, oldestKept - 1 - since),
      latestSeq: this.latestSeq,
    };
  }
}

/** Redacts secret shapes and caps a piece of page text before it is stored or shown. */
export function sanitizeLoggedText(text: string): string {
  return truncateText(redactSecrets(text), {
    maxTextLength: MAX_LOGGED_TEXT_CHARS,
    maxArrayLength: 0,
    maxTreeNodes: 0,
  }).text;
}

const IDENTIFIER_SEGMENT =
  /^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|[\w-]{24,})$/iu;

/**
 * Reduces a URL to what says which endpoint it was: the origin, the path with every identifier
 * segment (a number, a UUID, a long hex or token-like string) replaced by `:id`, and the names of
 * the query parameters. Query values, fragments and credentials in the URL never survive, since
 * they are where tokens and personal data travel.
 */
export function templateUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return '[invalid url]';
  }
  const path = parsed.pathname
    .split('/')
    .map((segment) => (IDENTIFIER_SEGMENT.test(segment) ? ':id' : segment))
    .join('/');
  const names = [...new Set(parsed.searchParams.keys())].sort();
  const query = names.length === 0 ? '' : `?${names.join('&')}`;
  return sanitizeLoggedText(`${parsed.protocol}//${parsed.host}${path}${query}`);
}
