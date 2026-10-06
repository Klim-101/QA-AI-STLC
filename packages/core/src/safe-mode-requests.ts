// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { templateUrl } from './browser-event-log.js';

/** How many distinct requests a summary lists; the rest are dropped, busiest first kept. */
export const MAX_SUMMARISED_REQUESTS = 20;

/** One kind of request safe mode saw, by method and path, never by query, header or body. */
export interface RequestSummary {
  readonly method: string;
  readonly path: string;
  readonly count: number;
}

export interface SafeModeRequestSummaries {
  /** Non-GET requests the environment's `safeNonGetRequests` let through (ADR-0014). */
  readonly allowed: readonly RequestSummary[];
  /** Requests safe mode aborted. */
  readonly blocked: readonly RequestSummary[];
}

// The path of the templated URL, so an identifier segment collapses to `:id` and a query value
// (where tokens travel) never reaches a report.
function summaryPath(url: string): string {
  const templated = templateUrl(url);
  try {
    return new URL(templated).pathname;
  } catch {
    return templated;
  }
}

function byBusiestThenName(left: RequestSummary, right: RequestSummary): number {
  return (
    right.count - left.count || `${left.method} ${left.path}`.localeCompare(`${right.method} ${right.path}`)
  );
}

function record(counts: Map<string, RequestSummary>, method: string, url: string): void {
  const path = summaryPath(url);
  const key = `${method} ${path}`;
  const known = counts.get(key);
  counts.set(key, { method, path, count: (known?.count ?? 0) + 1 });
}

function summarise(counts: ReadonlyMap<string, RequestSummary>): RequestSummary[] {
  return [...counts.values()].sort(byBusiestThenName).slice(0, MAX_SUMMARISED_REQUESTS);
}

/**
 * What safe mode did over a session or an exploration: the non-GET requests it let through because
 * the environment lists them, and the ones it blocked. Kept by method and path with a count, so a
 * report can tell an operator which request an application stalled on without a body, a header or
 * a query value ever being recorded (AGENTS.md 5.8).
 */
export class SafeModeRequestTally {
  private readonly allowedCounts = new Map<string, RequestSummary>();
  private readonly blockedCounts = new Map<string, RequestSummary>();

  recordAllowed(method: string, url: string): void {
    record(this.allowedCounts, method, url);
  }

  recordBlocked(method: string, url: string): void {
    record(this.blockedCounts, method, url);
  }

  summary(): SafeModeRequestSummaries {
    return { allowed: summarise(this.allowedCounts), blocked: summarise(this.blockedCounts) };
  }
}
