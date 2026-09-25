// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  QaError,
  type EngineContext,
  type Runner,
  type RunnerInput,
  type RunnerOutcome,
} from '@qa-ai-stlc/core';
import { randomUUID } from 'node:crypto';
import { PlaywrightJsonReportSchema } from './json-report.js';
import { mapReportToRunResults } from './map-result.js';
import { generateSpecConfigSource } from './spec-config.js';

// `@playwright/test`'s own CLI entry, resolved through Node's module graph rather than spawned
// through `npx`: it works whether this package is installed inside the monorepo or, once
// published, inside an operator's project, and needs no shell or PATH lookup (AGENTS.md 5.6).
const cliPath = fileURLToPath(import.meta.resolve('@playwright/test/cli'));

async function runOnce(engine: EngineContext, input: RunnerInput): Promise<readonly RunnerOutcome[]> {
  const runDir = join(tmpdir(), 'qa-ai-stlc-runner-playwright', randomUUID());
  const configPath = join(runDir, 'playwright.config.mjs');
  const reportPath = join(runDir, 'report.json');
  const outputDir = join(runDir, 'test-results');

  await engine.fs.mkdir(runDir);
  const { source } = generateSpecConfigSource({
    baseUrl: input.baseUrl,
    specFiles: input.specFiles,
    reportPath,
    outputDir,
  });
  await engine.fs.writeFile(configPath, source);

  await engine.processRunner.run(process.execPath, [cliPath, 'test', `--config=${configPath}`]);

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

  return mapReportToRunResults({
    report,
    runId: input.runId,
    testType: 'e2e',
    fs: engine.fs,
    ...(input.idGenerator !== undefined ? { idGenerator: input.idGenerator } : {}),
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
  run: runOnce,
};
