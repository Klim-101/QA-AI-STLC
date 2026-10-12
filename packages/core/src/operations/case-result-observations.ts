// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { basename } from 'node:path';
import {
  A11yScanRecordSchema,
  BrowserActionSchema,
  HttpRequestRecordSchema,
  type A11yScanRecord,
  type BrowserAction,
  type HttpRequestRecord,
  type Identifier,
} from '@qa-ai-stlc/schemas';
import type { QaStore } from '../qa-store.js';

/** One engine-registered record a `passed` result cites, read back in the shape the engine wrote. */
export type CitedObservation =
  | { readonly source: 'action'; readonly stepId?: Identifier; readonly action: BrowserAction }
  | { readonly source: 'http'; readonly stepId?: Identifier; readonly record: HttpRequestRecord }
  | { readonly source: 'scan'; readonly stepId?: Identifier; readonly record: A11yScanRecord };

/**
 * Reads the records behind the evidence ids a result cites, from `evidence/<runId>/`. Those ids were
 * already verified to be registered under that run, so evidence of another run is never read. A
 * file that is not JSON, or not a record shape the engine writes (a screenshot, a HAR, a log), is
 * skipped rather than trusted.
 */
export async function readCitedObservations(
  store: QaStore,
  runId: Identifier,
  evidenceIds: readonly Identifier[],
): Promise<readonly CitedObservation[]> {
  const files = await store.listFiles(`evidence/${runId}`);
  const observations: CitedObservation[] = [];
  for (const evidenceId of evidenceIds) {
    const path = files.find((file) => file.endsWith('.json') && basename(file).startsWith(`${evidenceId}.`));
    const observation = path === undefined ? undefined : await readObservation(store, path);
    if (observation !== undefined) {
      observations.push(observation);
    }
  }
  return observations;
}

async function readObservation(store: QaStore, path: string): Promise<CitedObservation | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await store.readText(path));
  } catch {
    return undefined;
  }
  const action = BrowserActionSchema.safeParse(parsed);
  if (action.success) {
    return {
      source: 'action',
      ...(action.data.stepId === undefined ? {} : { stepId: action.data.stepId }),
      action: action.data,
    };
  }
  const request = HttpRequestRecordSchema.safeParse(parsed);
  if (request.success) {
    return {
      source: 'http',
      ...(request.data.stepId === undefined ? {} : { stepId: request.data.stepId }),
      record: request.data,
    };
  }
  const scan = A11yScanRecordSchema.safeParse(parsed);
  if (scan.success) {
    return {
      source: 'scan',
      ...(scan.data.stepId === undefined ? {} : { stepId: scan.data.stepId }),
      record: scan.data,
    };
  }
  return undefined;
}
