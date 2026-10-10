// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  QaError,
  type EngineContext,
  type Runner,
  type RunnerInput,
  type RunnerOutcome,
} from '@qa-ai-stlc/core';
import type { EvidenceKind, TestType } from '@qa-ai-stlc/schemas';
import { randomUUID } from 'node:crypto';
import { PlaywrightJsonReportSchema } from './json-report.js';
import { StepWorkReportSchema, type StepWorkReport } from './step-work.js';
import { mapReportToRunResults } from './map-result.js';
import { generateSpecConfigSource } from './spec-config.js';

// `@playwright/test`'s own CLI entry, resolved through Node's module graph rather than spawned
// through `npx`: it works whether this package is installed inside the monorepo or, once
// published, inside an operator's project, and needs no shell or PATH lookup (AGENTS.md 5.6).
const cliPath = fileURLToPath(import.meta.resolve('@playwright/test/cli'));
// Next to this module with the extension this module has: `.js` once built, `.ts` when the sources run
// directly (Playwright compiles a TypeScript reporter itself).
const stepWorkReporterPath = fileURLToPath(
  new URL(`./step-work-reporter${extname(fileURLToPath(import.meta.url))}`, import.meta.url),
);

export interface RunPlaywrightSpecsOptions {
  /** Added to the Playwright process's environment only; how a run hands it credentials it must not write to disk. */
  readonly env?: Readonly<Record<string, string>>;
  /** See `SpecConfigOptions.isTraceEnabled`. */
  readonly isTraceEnabled?: boolean;
  /** See `MapReportOptions.extraEvidenceKindsByContentType`. */
  readonly extraEvidenceKindsByContentType?: Readonly<Record<string, EvidenceKind>>;
}

async function readStepWork(engine: EngineContext, stepWorkPath: string): Promise<StepWorkReport> {
  if (!(await engine.fs.pathExists(stepWorkPath))) {
    throw new QaError(
      'RUNNER_NO_STEP_WORK',
      'Playwright did not write the step-work report, so what each step did cannot be checked.',
      {
        remediation:
          'Re-run the verification; if it persists, Playwright itself may be failing to load reporters.',
      },
    );
  }
  return StepWorkReportSchema.parse(JSON.parse(await engine.fs.readFile(stepWorkPath)));
}

/**
 * Executes `input.specFiles` through Playwright Test and attributes every result to `testType`.
 * `runner-api` runs its `APIRequestContext` specs through the same mechanics, so the spawn, report
 * parsing and evidence mapping live in one place.
 */
export async function runPlaywrightSpecs(
  engine: EngineContext,
  input: RunnerInput,
  testType: TestType,
  options: RunPlaywrightSpecsOptions = {},
): Promise<readonly RunnerOutcome[]> {
  const runDir = join(tmpdir(), 'qa-ai-stlc-runner-playwright', randomUUID());
  const configPath = join(runDir, 'playwright.config.mjs');
  const reportPath = join(runDir, 'report.json');
  const outputDir = join(runDir, 'test-results');
  const stepWorkPath = join(runDir, 'step-work.json');
  // Only a run with a canonical step set (verification) can say what a step owes; an ordinary
  // `qa run` over arbitrary spec files has none.
  const isStepWorkChecked = input.requiredStepIds !== undefined;

  await engine.fs.mkdir(runDir);
  const { source } = generateSpecConfigSource({
    baseUrl: input.baseUrl,
    specFiles: input.specFiles,
    reportPath,
    outputDir,
    ...(isStepWorkChecked
      ? { stepWork: { reporterPath: stepWorkReporterPath, outputFile: stepWorkPath } }
      : {}),
    ...(input.testIdAttribute !== undefined ? { testIdAttribute: input.testIdAttribute } : {}),
    ...(options.isTraceEnabled !== undefined ? { isTraceEnabled: options.isTraceEnabled } : {}),
  });
  await engine.fs.writeFile(configPath, source);

  await engine.processRunner.run(
    process.execPath,
    [cliPath, 'test', `--config=${configPath}`],
    options.env !== undefined ? { env: options.env } : undefined,
  );

  const reportExists = await engine.fs.pathExists(reportPath);
  if (!reportExists) {
    throw new QaError(
      'RUNNER_NO_REPORT',
      'Playwright did not produce a JSON report; it may have crashed before any test ran.',
    );
  }
  const raw = await engine.fs.readFile(reportPath);
  const parsed: unknown = JSON.parse(raw);
  const report = PlaywrightJsonReportSchema.parse(parsed);

  const stepWork = isStepWorkChecked ? await readStepWork(engine, stepWorkPath) : undefined;

  return mapReportToRunResults({
    report,
    runId: input.runId,
    testType,
    fs: engine.fs,
    ...(stepWork !== undefined ? { stepWork } : {}),
    ...(input.idGenerator !== undefined ? { idGenerator: input.idGenerator } : {}),
    ...(input.requiredStepIds !== undefined ? { requiredStepIds: input.requiredStepIds } : {}),
    ...(options.extraEvidenceKindsByContentType !== undefined
      ? { extraEvidenceKindsByContentType: options.extraEvidenceKindsByContentType }
      : {}),
  });
}

/**
 * Runs a spec set through the real Playwright Test runner and maps its JSON report to validated
 * `RunResult` values (P3-01). A non-zero Playwright exit code (some tests failed) is expected,
 * ordinary output — only a missing report (Playwright itself crashed) is an engine error; a
 * failed test is a `RunResult` with `status: 'failed'`, not a thrown exception.
 */
export const playwrightRunner: Runner = {
  testType: 'e2e',
  run: (engine, input) => runPlaywrightSpecs(engine, input, 'e2e'),
};
