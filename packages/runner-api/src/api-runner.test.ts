// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import {
  API_AUTH_ENVIRONMENT_VARIABLE,
  API_AUTH_MODULE_PATH,
  type EngineContext,
  type RunnerOutcome,
} from '@qa-ai-stlc/core';
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

interface EngineOptions {
  readonly specSource?: string;
  readonly env?: Record<string, string>;
  readonly apiAuthYaml?: string;
}

const DEFAULT_SPEC_SOURCE =
  "test('t', { annotation: { type: 'testCaseId', description: 'case-1' } }, async () => {});";

function engineWith(endpointPath: string, options: EngineOptions = {}): EngineContext {
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
        ...(options.apiAuthYaml !== undefined ? [options.apiAuthYaml] : []),
        '',
      ].join('\n'),
      [join('project', 'openapi.json')]: SPEC,
      [SPEC_PATH]: options.specSource ?? DEFAULT_SPEC_SOURCE,
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
    env: options.env ?? {},
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

  describe('authentication through apiAuth profiles', () => {
    const AUTH_SPEC = `${DEFAULT_SPEC_SOURCE}\nconst options = apiAuth('service');`;
    const PROFILES_YAML =
      'apiAuth: { profiles: { service: { type: bearer, tokenVariable: QA_SERVICE_TOKEN } }, defaults: {} }';
    const authOptions = {
      specSource: AUTH_SPEC,
      apiAuthYaml: PROFILES_YAML,
      env: { QA_SERVICE_TOKEN: 'super-secret-token' },
    };

    function outcomeWith(
      status: 'failed' | 'passed',
      message: string,
      evidence: RunnerOutcome['evidence'] = [],
    ): RunnerOutcome {
      return {
        result: {
          schemaVersion: 1,
          id: 'run-result-1',
          runId: 'run-1',
          testCaseId: 'case-1',
          testType: 'api',
          status,
          startedAt: '2026-09-30T12:00:00Z',
          finishedAt: '2026-09-30T12:00:01Z',
          evidenceIds: [],
          ...(status === 'failed' ? { failure: { message } } : {}),
        },
        evidence,
      };
    }

    it('writes the helper and hands only the named profile to the spec process, with no trace', async () => {
      const engine = engineWith('/tasks/{id}', authOptions);

      await apiRunner.run(engine, input);

      expect(await engine.fs.readFile(join('project', ...API_AUTH_MODULE_PATH.split('/')))).toContain(
        '"service"',
      );
      const [, , testType, runOptions] = runPlaywrightSpecs.mock.calls[0] as unknown as [
        unknown,
        unknown,
        string,
        { env: Record<string, string>; isTraceEnabled: boolean },
      ];
      expect(testType).toBe('api');
      expect(runOptions.isTraceEnabled).toBe(false);
      expect(JSON.parse(runOptions.env[API_AUTH_ENVIRONMENT_VARIABLE] ?? '')).toEqual({
        service: { headers: { Authorization: 'Bearer super-secret-token' }, params: {} },
      });
    });

    it('scrubs the credential from a failure and keeps the failure backed by evidence', async () => {
      runPlaywrightSpecs.mockResolvedValue([
        outcomeWith('failed', 'expected 200, got 401 for Bearer super-secret-token'),
      ]);

      const outcomes = await apiRunner.run(engineWith('/tasks/{id}', authOptions), input);

      expect(outcomes[0]?.result.failure?.message).toBe('expected 200, got 401 for Bearer [REDACTED]');
      expect(outcomes[0]?.evidence).toEqual([
        { kind: 'other', content: 'expected 200, got 401 for Bearer [REDACTED]' },
      ]);
    });

    it('leaves evidence the runner already captured and passing results untouched', async () => {
      const captured = [{ kind: 'screenshot' as const, content: new Uint8Array([1]) }];
      runPlaywrightSpecs.mockResolvedValue([outcomeWith('failed', 'x', captured), outcomeWith('passed', '')]);

      const outcomes = await apiRunner.run(engineWith('/tasks/{id}', authOptions), input);

      expect(outcomes[0]?.evidence).toBe(captured);
      expect(outcomes[1]?.result.status).toBe('passed');
    });

    it('refuses to resolve a profile for a base URL outside the allowlist', async () => {
      const rejected = await apiRunner
        .run(engineWith('/tasks/{id}', authOptions), { ...input, baseUrl: 'https://elsewhere.example.org' })
        .catch((caught: unknown) => caught);

      expect(rejected).toBeInstanceOf(Error);
      expect(runPlaywrightSpecs).not.toHaveBeenCalled();
    });

    it('fails naming the variable, not its value, when the profile cannot be resolved', async () => {
      const rejected = await apiRunner
        .run(engineWith('/tasks/{id}', { ...authOptions, env: {} }), input)
        .catch((caught: unknown) => caught);

      expect(rejected).toMatchObject({ code: 'API_AUTH_VARIABLE_MISSING' });
      expect((rejected as Error).message).toContain('QA_SERVICE_TOKEN');
      expect(runPlaywrightSpecs).not.toHaveBeenCalled();
    });

    it('rejects a profile the configuration does not define', async () => {
      const rejected = await apiRunner
        .run(
          engineWith('/tasks/{id}', {
            ...authOptions,
            apiAuthYaml: 'apiAuth: { profiles: {}, defaults: {} }',
          }),
          input,
        )
        .catch((caught: unknown) => caught);

      expect(rejected).toMatchObject({ code: 'API_AUTH_PROFILE_UNKNOWN' });
    });

    it('rejects a spec that writes a credential header itself', async () => {
      const rejected = await apiRunner
        .run(
          engineWith('/tasks/{id}', {
            ...authOptions,
            specSource: `${AUTH_SPEC}\nconst headers = { Authorization: 'Bearer abcdefghij' };`,
          }),
          input,
        )
        .catch((caught: unknown) => caught);

      expect(rejected).toMatchObject({ code: 'HTTP_CREDENTIAL_INPUT_REJECTED' });
      expect(runPlaywrightSpecs).not.toHaveBeenCalled();
    });
  });
});
