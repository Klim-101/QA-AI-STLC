// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { RelativePath } from '@qa-ai-stlc/schemas';
import type { QaStore } from './qa-store.js';

const RUNS_DIR: RelativePath = 'runs';

/**
 * Every `RunResultSchema` artifact recorded under `runs/**`, in either layout `qa run`'s
 * `runs/<run-id>/results/<result-id>.json` (P3-04) or interactive case execution's
 * `runs/<test-case-id>/<result-id>.json` (P3-14, `runRegisterCaseResult`). `run.json`
 * (`RunRecordSchema`, one per `qa run` invocation, not a result) is the only other thing ever
 * written under `runs/`, so excluding it is enough to isolate every result regardless of layout.
 */
export async function listRunResultPaths(store: QaStore): Promise<readonly RelativePath[]> {
  const paths = await store.listFiles(RUNS_DIR);
  return paths.filter((path) => !path.endsWith('/run.json'));
}
