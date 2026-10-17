// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { TriageSchema, type RelativePath, type Triage } from '@qa-ai-stlc/schemas';
import { loadConfig } from '../config-loader.js';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { isFlakyHistory } from '../flaky-detection.js';
import { readJsonFile, toCanonicalJson } from '../json-file.js';
import { ManifestStore } from '../manifest-store.js';
import { assertRelativePath, resolveRelativePath } from '../paths.js';
import { QaStore } from '../qa-store.js';
import { parseInlineContent } from '../schema-issues.js';
import {
  evidencePathsOfResult,
  historyOfCase,
  loadAllRunResults,
  selectRunFailures,
} from '../triage-failures.js';

export interface TriageAddOptions {
  readonly path?: string;
  /** The triage itself, instead of a file holding it; validated by `TriageSchema` exactly like a file's content. */
  readonly triage?: unknown;
}

export interface TriageAddResult {
  readonly runId: string;
  readonly triagePath: string;
  readonly entryCount: number;
}

function triageAddUsageError(): QaError {
  return new QaError('TRIAGE_ADD_USAGE', 'Usage: qa triage add --path <path>', {
    remediation: 'Give exactly one of a file path (--path triage.json) or an inline triage.',
  });
}

async function readTriage(context: EngineContext, options: TriageAddOptions): Promise<Triage> {
  if (options.triage !== undefined) {
    if (options.path !== undefined) {
      throw triageAddUsageError();
    }
    return parseInlineContent(TriageSchema, options.triage, { code: 'TRIAGE_INVALID', subject: 'triage' });
  }
  if (options.path === undefined) {
    throw triageAddUsageError();
  }
  const path = assertRelativePath(options.path);
  const absolutePath = resolveRelativePath(context.projectRoot, path);
  if (!(await context.fs.pathExists(absolutePath))) {
    throw new QaError('TRIAGE_ADD_FILE_NOT_FOUND', `"${path}" does not exist`, {
      remediation: 'Check --path points at a real, readable file relative to the project root.',
    });
  }
  return readJsonFile(context.fs, absolutePath, TriageSchema);
}

/**
 * `qa triage add` / MCP `qa.triage_add` (P4-05): validates the triage spoke's classification of a
 * run's failures and registers it under `artifacts/triage/<run-id>.json`. The engine checks what it
 * can (AGENTS.md 12.1): every failed result of the run is classified exactly once, each entry names
 * its own case, evidence is only that of the result it is cited for, and `flaky` is accepted only
 * for a case whose recorded history the configured thresholds call flaky. Registering again for the
 * same run replaces the earlier triage.
 */
export async function runTriageAdd(
  context: EngineContext,
  options: TriageAddOptions,
): Promise<TriageAddResult> {
  const triage = await readTriage(context, options);
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const { flaky } = await loadConfig(context);
  const results = await loadAllRunResults(store);
  const failed = new Map(selectRunFailures(results, triage.runId).map((result) => [result.id, result]));

  const seen = new Set<string>();
  for (const entry of triage.entries) {
    if (seen.has(entry.resultId)) {
      throw new QaError(
        'TRIAGE_DUPLICATE_RESULT',
        `Result "${entry.resultId}" is classified more than once`,
        {
          remediation: 'Give each failed result exactly one entry.',
        },
      );
    }
    seen.add(entry.resultId);
    const result = failed.get(entry.resultId);
    if (result === undefined) {
      throw new QaError(
        'TRIAGE_RESULT_NOT_FAILED',
        `"${entry.resultId}" is not a failed result of run "${triage.runId}"`,
        { remediation: 'Classify only the failed results qa.triage_input listed.' },
      );
    }
    if (result.testCaseId !== entry.testCaseId) {
      throw new QaError(
        'TRIAGE_CASE_MISMATCH',
        `Result "${entry.resultId}" belongs to case "${result.testCaseId}", not "${entry.testCaseId}"`,
        { remediation: 'Copy the testCaseId from the failure qa.triage_input listed.' },
      );
    }
    const own = new Set<string>(await evidencePathsOfResult(store, result));
    const foreign = entry.evidencePaths.filter((path) => !own.has(path));
    if (foreign.length > 0) {
      throw new QaError(
        'TRIAGE_EVIDENCE_NOT_OF_RESULT',
        `Entry "${entry.resultId}" cites evidence that is not that result's: ${foreign.join(', ')}`,
        { remediation: 'Cite only the evidence paths qa.triage_input listed for that failure.' },
      );
    }
    if (
      entry.category === 'flaky' &&
      !isFlakyHistory(
        historyOfCase(results, result.testCaseId).map((recorded) => recorded.status),
        flaky,
      )
    ) {
      throw new QaError(
        'TRIAGE_FLAKY_WITHOUT_HISTORY',
        `Case "${result.testCaseId}" is classified flaky, but its recorded history is not flaky by the configured thresholds`,
        {
          remediation:
            'Classify it as product-bug, stale-selector, environment or uncertain, or record more runs first (flaky.historyWindow, flaky.minStatusChanges).',
        },
      );
    }
  }
  const unclassified = [...failed.keys()].filter((id) => !seen.has(id));
  if (unclassified.length > 0) {
    throw new QaError(
      'TRIAGE_FAILURES_UNCLASSIFIED',
      `Failed results with no entry: ${unclassified.join(', ')}`,
      { remediation: 'Classify every failed result; use "uncertain" for one the evidence cannot place.' },
    );
  }

  const triagePath: RelativePath = `artifacts/triage/${triage.runId}.json`;
  const serialized = toCanonicalJson(triage);
  await store.writeText(triagePath, serialized);
  await manifest.register(triagePath, serialized);
  return { runId: triage.runId, triagePath, entryCount: triage.entries.length };
}
