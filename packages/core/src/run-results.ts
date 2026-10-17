// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { RelativePath } from '@qa-ai-stlc/schemas';
import type { QaStore } from './qa-store.js';

const RUNS_DIR: RelativePath = 'runs';
const INTERACTIVE_RESULT_PATH = /^runs\/[^/]+\/[^/]+\.json$/;
// What the spoke I/O store writes under a run (P4-01): dispatch inputs and outputs, not results.
const SPOKE_RECORD_PATH = /^runs\/[^/]+\/spokes\//;

/**
 * Every `RunResultSchema` artifact recorded under `runs/**`, in either layout `qa run`'s
 * `runs/<run-id>/results/<result-id>.json` (P3-04) or interactive case execution's
 * `runs/<test-case-id>/<result-id>.json` (P3-14, `runRegisterCaseResult`). `run.json`
 * (`RunRecordSchema`, one per `qa run` invocation) and the spoke records of
 * `runs/<run-id>/spokes/**` (P4-01) are the only other things written under `runs/`; both are left
 * out, so a project whose hub recorded a dispatch can still be read as results.
 */
export async function listRunResultPaths(store: QaStore): Promise<readonly RelativePath[]> {
  const paths = await store.listFiles(RUNS_DIR);
  return paths.filter((path) => !path.endsWith('/run.json') && !SPOKE_RECORD_PATH.test(path));
}

/**
 * Only the results interactive case execution registered (`runs/<test-case-id>/<result-id>.json`),
 * which no `RunRecord` summarises because no spec set or runner stood behind them.
 */
export async function listInteractiveResultPaths(store: QaStore): Promise<readonly RelativePath[]> {
  const paths = await listRunResultPaths(store);
  return paths.filter((path) => INTERACTIVE_RESULT_PATH.test(path));
}
