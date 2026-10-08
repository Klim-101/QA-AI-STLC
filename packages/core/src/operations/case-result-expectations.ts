// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { BrowserActionSchema, type Identifier } from '@qa-ai-stlc/schemas';
import type { QaStore } from '../qa-store.js';

interface ExpectationObservation {
  readonly groupKey: string;
  readonly describe: string;
  readonly passed: boolean;
  readonly at: string;
}

/**
 * Describes every browser expectation of a run whose latest check still failed. A failed
 * `qa.browser_expect` is registered as evidence like a passed one, so the run's own record can
 * contradict a `passed` verdict a caller supplies. Every expectation under the run is considered,
 * not only the cited evidence ids: leaving the failing record out of the citation must not hide it.
 *
 * A retry is allowed: expectations are grouped by step, target and kind, and only the newest one in
 * a group counts, so a failure followed by a later pass of the same check is not outstanding.
 */
export async function findUnresolvedFailedExpectations(
  store: QaStore,
  runId: Identifier,
): Promise<readonly string[]> {
  const files = await store.listFiles(`evidence/${runId}`);
  const latestByGroup = new Map<string, ExpectationObservation>();
  for (const path of [...files].sort()) {
    if (!path.endsWith('.json') || path.endsWith('.quarantine.json')) {
      continue;
    }
    const observation = await readExpectation(store, path);
    if (observation === undefined) {
      continue;
    }
    const previous = latestByGroup.get(observation.groupKey);
    if (previous === undefined || observation.at >= previous.at) {
      latestByGroup.set(observation.groupKey, observation);
    }
  }
  return [...latestByGroup.values()].filter((entry) => !entry.passed).map((entry) => entry.describe);
}

async function readExpectation(store: QaStore, path: string): Promise<ExpectationObservation | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await store.readText(path));
  } catch {
    // Evidence of other kinds (a HAR, a request/response pair) is not an expectation record.
    return undefined;
  }
  const action = BrowserActionSchema.safeParse(parsed);
  if (!action.success || action.data.type !== 'expect' || action.data.expectation === undefined) {
    return undefined;
  }
  const { stepId, selector, ref, expectation, at } = action.data;
  const target = selector ?? ref?.id ?? '';
  return {
    groupKey: [stepId ?? '', target, expectation.kind].join('\u0000'),
    describe: `${expectation.kind} on ${target === '' ? 'the page' : `"${target}"`} (${path})`,
    passed: expectation.passed,
    at,
  };
}
