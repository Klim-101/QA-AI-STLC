// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  SpokeInputRecordSchema,
  SpokeOutputRecordSchema,
  SpokePathSegmentSchema,
  SpokeResultSchema,
  type SpokeInputRecord,
  type SpokeOutputRecord,
  type SpokeResult,
} from '@qa-ai-stlc/schemas';
import type { EngineContext } from '../engine-context.js';
import { loadConfig } from '../config-loader.js';
import { QaError } from '../errors.js';
import { toCanonicalJson } from '../json-file.js';
import { QaStore } from '../qa-store.js';
import { parseInlineContent } from '../schema-issues.js';
import { redactSecrets } from '../secret-scan.js';
import { assertParallelismAvailable, assertWithinTimeout, toSpokeBudgets } from './spoke-budgets.js';

/** A record is the hub's own bookkeeping, so one this large is data that should have been a reference. */
export const MAX_SPOKE_RECORD_BYTES = 256 * 1024;

const INPUT_FILE = 'input.json';
const OUTPUT_FILE = 'output.json';
const ATTEMPT_DIRECTORY = /^attempt-([1-9][0-9]*)$/u;
const ATTEMPT_FILE = /^attempt-([1-9][0-9]*)[/]/u;

export interface SpokeInputOptions {
  readonly runId: string;
  readonly spokeId: string;
  readonly taskId: string;
  readonly task: string;
  /** The minimal context the spoke was given; secrets in it are redacted before it is stored. */
  readonly context?: unknown;
}

export const SPOKE_RETRY_BUDGET_EXCEEDED = 'SPOKE_RETRY_BUDGET_EXCEEDED';

/**
 * `recorded` means the hub may dispatch the attempt. `retry_budget_exhausted` means the task has
 * used every attempt `agents.retries` allows: nothing is stored, `budgetError` says why, and the hub
 * reports the task as blocked instead of dispatching again.
 */
export interface SpokeInputResult {
  readonly status: 'recorded' | 'retry_budget_exhausted';
  readonly attempt: number;
  readonly inputPath?: string;
  readonly wasRedacted: boolean;
  readonly budgetError?: {
    readonly code: typeof SPOKE_RETRY_BUDGET_EXCEEDED;
    readonly message: string;
    readonly remediation: string;
  };
}

export interface SpokeOutputOptions {
  readonly runId: string;
  readonly attempt: number;
  readonly result: unknown;
}

export interface SpokeOutputResult {
  readonly attempt: number;
  readonly outputPath: string;
  readonly status: SpokeResult['status'];
  readonly wasRedacted: boolean;
  readonly wasAlreadyRecorded: boolean;
}

export interface SpokeListOptions {
  readonly runId: string;
}

export interface SpokeRecordSummary {
  readonly spokeId: string;
  readonly taskId: string;
  readonly attempt: number;
  readonly inputPath: string;
  readonly outputPath?: string;
  readonly status?: SpokeResult['status'];
}

export interface SpokeListResult {
  readonly runId: string;
  readonly records: readonly SpokeRecordSummary[];
}

function attemptDirectory(runId: string, spokeId: string, taskId: string, attempt: number): string {
  return `runs/${runId}/spokes/${spokeId}/${taskId}/attempt-${String(attempt)}`;
}

function assertSegment(name: string, value: string): string {
  const result = SpokePathSegmentSchema.safeParse(value);
  if (!result.success) {
    throw new QaError('SPOKE_NAME_INVALID', `"${value}" cannot name a spoke record (${name})`, {
      remediation:
        'Use 1-64 letters, digits, ".", "_" or "-", starting with a letter or digit, with no path separator.',
    });
  }
  return result.data;
}

/** Redacts every string in a JSON value, so the stored value is still valid JSON. */
function redactValue(value: unknown): { readonly value: unknown; readonly wasRedacted: boolean } {
  if (typeof value === 'string') {
    const redacted = redactSecrets(value);
    return { value: redacted, wasRedacted: redacted !== value };
  }
  if (Array.isArray(value)) {
    const items = value.map((item: unknown) => redactValue(item));
    return { value: items.map((item) => item.value), wasRedacted: items.some((item) => item.wasRedacted) };
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).map(([key, item]) => [key, redactValue(item)] as const);
    return {
      value: Object.fromEntries(entries.map(([key, item]) => [key, item.value])),
      wasRedacted: entries.some(([, item]) => item.wasRedacted),
    };
  }
  return { value, wasRedacted: false };
}

function serializeRecord(record: unknown): string {
  const serialized = toCanonicalJson(record);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_SPOKE_RECORD_BYTES) {
    throw new QaError(
      'SPOKE_RECORD_TOO_LARGE',
      `The spoke record is larger than ${String(MAX_SPOKE_RECORD_BYTES)} bytes`,
      { remediation: 'Record a reference to the data (a registered artifact path), not the data itself.' },
    );
  }
  return serialized;
}

async function listAttempts(
  store: QaStore,
  runId: string,
  spokeId: string,
  taskId: string,
): Promise<readonly number[]> {
  const prefix = `runs/${runId}/spokes/${spokeId}/${taskId}/`;
  const attempts = new Set<number>();
  for (const path of await store.listFiles(`runs/${runId}/spokes/${spokeId}/${taskId}`)) {
    const match = ATTEMPT_FILE.exec(path.slice(prefix.length));
    if (match?.[1] !== undefined) {
      attempts.add(Number(match[1]));
    }
  }
  return [...attempts];
}

/**
 * `qa.spoke_record_input` (P4-01): stores what the hub gave a spoke for one attempt at one task
 * under `runs/<run-id>/spokes/<spoke>/<task>/attempt-<n>/input.json`. The engine numbers the attempt,
 * so a retry after a failed validation is the next attempt of the same task and nothing is
 * overwritten. Secrets are redacted before anything is written (AGENTS.md 2.8, 5.8).
 */
export async function runSpokeRecordInput(
  context: EngineContext,
  options: SpokeInputOptions,
): Promise<SpokeInputResult> {
  const runId = assertSegment('runId', options.runId);
  const spokeId = assertSegment('spokeId', options.spokeId);
  const taskId = assertSegment('taskId', options.taskId);
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const attempt = Math.max(0, ...(await listAttempts(store, runId, spokeId, taskId))) + 1;
  const budgets = toSpokeBudgets((await loadConfig(context)).agents);
  if (attempt > budgets.maxAttempts) {
    return {
      status: 'retry_budget_exhausted',
      attempt,
      wasRedacted: false,
      budgetError: {
        code: SPOKE_RETRY_BUDGET_EXCEEDED,
        message: `Task "${taskId}" of spoke "${spokeId}" has used its ${String(budgets.maxAttempts)} attempts (agents.retries allows ${String(budgets.maxAttempts - 1)} re-dispatches)`,
        remediation:
          'Do not dispatch it again. Report the task to the operator as blocked, or raise agents.retries in .qa/config.yaml.',
      },
    };
  }
  await assertParallelismAvailable(store, runId, context.clock.now(), budgets);
  const redactedContext = redactValue(options.context);
  const redactedTask = redactValue(options.task);

  const record: SpokeInputRecord = parseInlineContent(
    SpokeInputRecordSchema,
    {
      runId,
      spokeId,
      taskId,
      attempt,
      task: redactedTask.value,
      context: redactedContext.value,
      recordedAt: context.clock.now().toISOString(),
    },
    { code: 'SPOKE_INPUT_INVALID', subject: 'spoke input record' },
  );
  const inputPath = `${attemptDirectory(runId, spokeId, taskId, attempt)}/${INPUT_FILE}`;
  await store.writeText(inputPath, serializeRecord(record));
  return {
    status: 'recorded',
    attempt,
    inputPath,
    wasRedacted: redactedContext.wasRedacted || redactedTask.wasRedacted,
  };
}

/**
 * `qa.spoke_record_output` (P4-01): stores what came back for an attempt, exactly as the hub
 * received it and before the hub validates its payload. The attempt's input must be recorded first,
 * so an output never exists without the context that produced it. Recording the same result again
 * is a no-op; a different one for an attempt that already has an output is refused, because a
 * record is evidence and is never rewritten.
 */
export async function runSpokeRecordOutput(
  context: EngineContext,
  options: SpokeOutputOptions,
): Promise<SpokeOutputResult> {
  const runId = assertSegment('runId', options.runId);
  const result = parseInlineContent(SpokeResultSchema, options.result, {
    code: 'SPOKE_RESULT_INVALID',
    subject: 'spoke result',
  });
  const spokeId = assertSegment('spokeId', result.spokeId);
  const taskId = assertSegment('taskId', result.taskId);
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const directory = attemptDirectory(runId, spokeId, taskId, options.attempt);
  const inputPath = `${directory}/${INPUT_FILE}`;
  const outputPath = `${directory}/${OUTPUT_FILE}`;

  if (!(await store.pathExists(inputPath))) {
    throw new QaError(
      'SPOKE_OUTPUT_WITHOUT_INPUT',
      `No input is recorded for attempt ${String(options.attempt)} of task "${taskId}" of spoke "${spokeId}"`,
      {
        remediation:
          'Call qa.spoke_record_input before the spoke runs, and record its output under the attempt it returned.',
      },
    );
  }

  const redacted = redactValue(result);
  const redactedResult = parseInlineContent(SpokeResultSchema, redacted.value, {
    code: 'SPOKE_RESULT_INVALID',
    subject: 'spoke result',
  });
  if (await store.pathExists(outputPath)) {
    const existing = await store.readJson(outputPath, SpokeOutputRecordSchema);
    if (toCanonicalJson(existing.result) === toCanonicalJson(redactedResult)) {
      return {
        attempt: options.attempt,
        outputPath,
        status: existing.result.status,
        wasRedacted: redacted.wasRedacted,
        wasAlreadyRecorded: true,
      };
    }
    throw new QaError(
      'SPOKE_OUTPUT_EXISTS',
      `Attempt ${String(options.attempt)} of task "${taskId}" already has a different output`,
      { remediation: 'A record is never rewritten. Dispatch the task again: that is the next attempt.' },
    );
  }

  const input = await store.readJson(inputPath, SpokeInputRecordSchema);
  const budgets = toSpokeBudgets((await loadConfig(context)).agents);
  assertWithinTimeout(input.recordedAt, context.clock.now(), budgets, taskId);

  const record: SpokeOutputRecord = {
    schemaVersion: redactedResult.schemaVersion,
    runId,
    attempt: options.attempt,
    result: redactedResult,
    recordedAt: context.clock.now().toISOString(),
  };
  await store.writeText(outputPath, serializeRecord(record));
  return {
    attempt: options.attempt,
    outputPath,
    status: redactedResult.status,
    wasRedacted: redacted.wasRedacted,
    wasAlreadyRecorded: false,
  };
}

/**
 * `qa.spoke_list` (P4-01): every spoke attempt recorded for a run, with its output's status when
 * one exists, in a stable order. What evals and run metrics (P4-07, P4-10) read from.
 */
export async function runSpokeList(
  context: EngineContext,
  options: SpokeListOptions,
): Promise<SpokeListResult> {
  const runId = assertSegment('runId', options.runId);
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const prefix = `runs/${runId}/spokes/`;
  const paths = await store.listFiles(`runs/${runId}/spokes`);
  const inputs = paths.filter((path) => path.endsWith(`/${INPUT_FILE}`));

  const records: SpokeRecordSummary[] = [];
  for (const inputPath of inputs) {
    const [spokeId, taskId, directory] = inputPath.slice(prefix.length).split('/');
    const match = ATTEMPT_DIRECTORY.exec(directory ?? '');
    if (spokeId === undefined || taskId === undefined || match?.[1] === undefined) {
      continue;
    }
    const outputPath = `${inputPath.slice(0, -INPUT_FILE.length)}${OUTPUT_FILE}`;
    const output = paths.includes(outputPath)
      ? await store.readJson(outputPath, SpokeOutputRecordSchema)
      : undefined;
    records.push({
      spokeId,
      taskId,
      attempt: Number(match[1]),
      inputPath,
      ...(output === undefined ? {} : { outputPath, status: output.result.status }),
    });
  }
  return {
    runId,
    records: records.toSorted(
      (a, b) =>
        a.spokeId.localeCompare(b.spokeId) || a.taskId.localeCompare(b.taskId) || a.attempt - b.attempt,
    ),
  };
}
