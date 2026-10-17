// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  DefectDraftSchema,
  EvalScenarioSchema,
  SelectorRegistrySchema,
  type EvalReport,
} from '@qa-ai-stlc/schemas';
import type { EngineContext } from '../engine-context.js';
import { scoreEvalRun } from '../eval-score.js';
import { QaStore } from '../qa-store.js';
import { parseInlineContent } from '../schema-issues.js';
import { readSpokeAttempts } from '../spoke-records.js';
import { loadAllRunResults } from '../triage-failures.js';

const DEFECTS_DIR = 'artifacts/defects';
const REGISTRY_PATH = 'selectors/registry.json';

export interface EvalScoreOptions {
  /** The scenario, validated by `EvalScenarioSchema`. */
  readonly scenario: unknown;
}

/**
 * Scores the project in `context.projectRoot` against an eval scenario (P4-07): reads the spoke I/O
 * store, the run results, the registered defect drafts and the selector registry, and measures what
 * the run found and how it went. Reads only; the same call scores a scripted baseline and a run by
 * a real agent.
 */
export async function runEvalScore(context: EngineContext, options: EvalScoreOptions): Promise<EvalReport> {
  const scenario = parseInlineContent(EvalScenarioSchema, options.scenario, {
    code: 'EVAL_SCENARIO_INVALID',
    subject: 'eval scenario',
  });
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const defectPaths = (await store.listFiles(DEFECTS_DIR)).filter((path) => path.endsWith('.json'));
  const defects = await Promise.all(defectPaths.map((path) => store.readJson(path, DefectDraftSchema)));
  const registry = (await store.pathExists(REGISTRY_PATH))
    ? await store.readJson(REGISTRY_PATH, SelectorRegistrySchema)
    : undefined;

  return scoreEvalRun(
    scenario,
    {
      spokeRecords: await readSpokeAttempts(store),
      results: await loadAllRunResults(store),
      defects: defects.map((defect) => ({ id: defect.id, title: defect.title })),
      ...(registry === undefined ? {} : { registry }),
    },
    context.clock.now().toISOString(),
  );
}
