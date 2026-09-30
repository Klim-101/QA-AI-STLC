// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import type { EngineContext, RunnerOutcome } from '@qa-ai-stlc/core';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runPlaywrightSpecs = vi.fn<() => Promise<readonly RunnerOutcome[]>>();
vi.mock('@qa-ai-stlc/runner-playwright', () => ({
  runPlaywrightSpecs: (...args: unknown[]) => runPlaywrightSpecs(...(args as [])),
}));

const { apiRunner } = await import('./api-runner.js');

const SPEC_PATH = join('project', 'tests', 'api.spec.ts');
const SPEC = JSON.stringify({ openapi: '3.0.3', paths: { '/tasks/{taskId}': { get: {} } } });

function engineWith(endpointPath: string): EngineContext {
  return {
    projectRoot: 'project',
    fs: createFakeFileSystem({
      [join('project', '.qa', 'config.yaml')]: [
        'schemaVersion: 1',
        'testing: { e2e: undecided, api: in-scope, a11y: undecided, security: undecided }',
        'environments:\n  staging: { baseUrl: "https://staging.example.com", allowlist: ["staging.example.com"] }',
        'identities: {}',
        'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
        'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
        'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
        'api: { contract: openapi, source: openapi.json }',
        '',
      ].join('\n'),
      [join('project', 'openapi.json')]: SPEC,
      [SPEC_PATH]:
        "test('t', { annotation: { type: 'testCaseId', description: 'case-1' } }, async () => {});",
      [join('project', '.qa', 'artifacts', 'cases', 'tasks', 'case-1.json')]: JSON.stringify({
        schemaVersion: 1,
        id: 'case-1',
        feature: 'tasks',
        requirementIds: ['req-1'],
        testType: 'api',
        title: 'case',
        steps: [{ description: 'call it' }],
        expectedResult: 'ok',
        endpoints: [{ method: 'GET', path: endpointPath }],
        status: 'approved',
        createdAt: '2026-09-30T12:00:00Z',
      }),
    }),
    clock: { now: () => new Date('2026-09-30T12:00:00Z') },
    logger: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeBrowserLauncher(),
    env: {},
  };
}

const input = {
  runId: 'run-1',
  baseUrl: 'https://staging.example.com',
  environment: 'staging',
  specFiles: [SPEC_PATH],
};

beforeEach(() => {
  runPlaywrightSpecs.mockReset();
  runPlaywrightSpecs.mockResolvedValue([]);
});

describe('apiRunner', () => {
  it('is the runner for the api test type', () => {
    expect(apiRunner.testType).toBe('api');
  });

  it('snapshots the contract and runs the specs as api results once every case is backed', async () => {
    const engine = engineWith('/tasks/{id}');

    await apiRunner.run(engine, input);

    expect(runPlaywrightSpecs).toHaveBeenCalledWith(engine, input, 'api');
    expect(await engine.fs.readFile(join('project', '.qa', 'artifacts', 'api-contract.txt'))).toBe(SPEC);
  });

  it('runs nothing and writes nothing when a case is not in the contract', async () => {
    const engine = engineWith('/nope');

    const rejected = await apiRunner.run(engine, input).catch((caught: unknown) => caught);

    expect(rejected).toMatchObject({ code: 'API_CASE_NOT_IN_CONTRACT' });
    expect(runPlaywrightSpecs).not.toHaveBeenCalled();
    expect(await engine.fs.pathExists(join('project', '.qa', 'manifest.json'))).toBe(false);
  });
});
