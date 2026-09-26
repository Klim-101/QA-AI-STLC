// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { noopLogger } from '../ports/logger.js';
import { runReport } from './report.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');
const NOW = new Date('2026-09-25T12:00:00.000Z');

const CONFIG_YAML = [
  'testing: { e2e: in-scope, api: undecided, a11y: undecided, security: undecided }',
  'environments: {}',
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
].join('\n');

function runRecordJson(overrides: { id: string; startedAt: string }): string {
  return JSON.stringify({
    schemaVersion: 1,
    id: overrides.id,
    testType: 'e2e',
    specFiles: ['tests/login.playwright-spec.ts'],
    baseUrl: 'https://staging.example.test/',
    startedAt: overrides.startedAt,
    finishedAt: '2026-09-25T10:00:05.000Z',
    resultIds: [],
    counts: { passed: 0, failed: 0, blocked: 0, skipped: 0, uncertain: 0, partial: 0 },
  });
}

function fakeContext(files: Readonly<Record<string, string>> = {}): EngineContext {
  return {
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem(files),
    clock: { now: () => NOW },
    logger: noopLogger,
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeBrowserLauncher(),
    env: {},
  };
}

describe('runReport', () => {
  it('renders the given run’s summary and the traceability matrix as Markdown by default', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'config.yaml')]: CONFIG_YAML,
      [join(QA_DIR, 'runs', 'run-1', 'run.json')]: runRecordJson({
        id: 'run-1',
        startedAt: '2026-09-25T10:00:00.000Z',
      }),
    });

    const result = await runReport(context, { runId: 'run-1' });

    expect(result.runId).toBe('run-1');
    expect(result.runRecordPath).toBe('runs/run-1/run.json');
    expect(result.format).toBe('markdown');
    expect(result.runSummary).toContain('# Run summary: run-1');
    expect(result.traceabilityMatrix).toContain('# Traceability matrix');
  });

  it('renders HTML when asked', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'config.yaml')]: CONFIG_YAML,
      [join(QA_DIR, 'runs', 'run-1', 'run.json')]: runRecordJson({
        id: 'run-1',
        startedAt: '2026-09-25T10:00:00.000Z',
      }),
    });

    const result = await runReport(context, { runId: 'run-1', format: 'html' });

    expect(result.format).toBe('html');
    expect(result.runSummary).toContain('<h1>Run summary: run-1</h1>');
    expect(result.traceabilityMatrix).toContain('<h1>Traceability matrix</h1>');
  });

  it('defaults to the most recently started run when none is given', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'config.yaml')]: CONFIG_YAML,
      [join(QA_DIR, 'runs', 'run-older', 'run.json')]: runRecordJson({
        id: 'run-older',
        startedAt: '2026-09-24T10:00:00.000Z',
      }),
      [join(QA_DIR, 'runs', 'run-newer', 'run.json')]: runRecordJson({
        id: 'run-newer',
        startedAt: '2026-09-25T10:00:00.000Z',
      }),
      // A third, even-older run listed after "run-newer": proves the newest-so-far is kept
      // rather than overwritten by every later run regardless of its own startedAt.
      [join(QA_DIR, 'runs', 'run-oldest', 'run.json')]: runRecordJson({
        id: 'run-oldest',
        startedAt: '2026-09-23T10:00:00.000Z',
      }),
    });

    const result = await runReport(context, {});

    expect(result.runId).toBe('run-newer');
  });

  it('rejects when no run has ever been recorded', async () => {
    const context = fakeContext();

    const error = await runReport(context, {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('REPORT_NO_RUNS');
  });

  it('rejects an unknown run id', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'runs', 'run-1', 'run.json')]: runRecordJson({
        id: 'run-1',
        startedAt: '2026-09-25T10:00:00.000Z',
      }),
    });

    const error = await runReport(context, { runId: 'missing' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('REPORT_RUN_NOT_FOUND');
  });
});
