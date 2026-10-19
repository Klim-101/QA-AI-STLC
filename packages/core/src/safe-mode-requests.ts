// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { templateUrl } from './browser-event-log.js';

/** How many distinct requests a summary lists; the rest are dropped, busiest first kept. */
export const MAX_SUMMARISED_REQUESTS = 20;

/**
 * Why safe mode aborted a request: its method is not allowed, or its host, scheme or port is not
 * the environment's. A request off the allowlist is reported by that, whatever its method.
 */
export type BlockedRequestReason = 'method' | 'host' | 'scheme' | 'port';

export const BLOCKED_REQUEST_REASONS: readonly BlockedRequestReason[] = ['method', 'host', 'scheme', 'port'];

/** One kind of request safe mode saw, by method and path, never by query, header or body. */
export interface RequestSummary {
  readonly method: string;
  readonly path: string;
  readonly count: number;
}

export interface BlockedRequestSummary extends RequestSummary {
  readonly reason: BlockedRequestReason;
}

/** How many requests were blocked for each reason: complete, unlike the capped summaries. */
export type BlockedRequestCounts = Readonly<Record<BlockedRequestReason, number>>;

export interface SafeModeRequestSummaries {
  /** Non-GET requests the environment's `safeNonGetRequests` let through (ADR-0014). */
  readonly allowed: readonly RequestSummary[];
  /** Requests safe mode aborted. */
  readonly blocked: readonly BlockedRequestSummary[];
  readonly blockedCounts: BlockedRequestCounts;
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

function increment<TSummary extends RequestSummary>(
  counts: Map<string, TSummary>,
  key: string,
  summaryWith: (count: number) => TSummary,
): void {
  counts.set(key, summaryWith((counts.get(key)?.count ?? 0) + 1));
}

function summarise<TSummary extends RequestSummary>(counts: ReadonlyMap<string, TSummary>): TSummary[] {
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
  private readonly blockedSummaries = new Map<string, BlockedRequestSummary>();
  private readonly totalsByReason: Record<BlockedRequestReason, number> = {
    method: 0,
    host: 0,
    scheme: 0,
    port: 0,
  };

  recordAllowed(method: string, url: string): void {
    const path = summaryPath(url);
    increment(this.allowedCounts, `${method} ${path}`, (count) => ({ method, path, count }));
  }

  recordBlocked(method: string, url: string, reason: BlockedRequestReason): void {
    const path = summaryPath(url);
    increment(this.blockedSummaries, `${reason} ${method} ${path}`, (count) => ({
      method,
      path,
      count,
      reason,
    }));
    this.totalsByReason[reason] += 1;
  }

  summary(): SafeModeRequestSummaries {
    return {
      allowed: summarise(this.allowedCounts),
      blocked: summarise(this.blockedSummaries),
      blockedCounts: { ...this.totalsByReason },
    };
  }
}
