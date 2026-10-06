// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { A11Y_SCAN_ENVIRONMENT_VARIABLE, type EngineContext, type RunnerOutcome } from '@qa-ai-stlc/core';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runPlaywrightSpecs = vi.fn<(...args: unknown[]) => Promise<readonly RunnerOutcome[]>>();
vi.mock('@qa-ai-stlc/runner-playwright', () => ({
  runPlaywrightSpecs: (...args: unknown[]) => runPlaywrightSpecs(...args),
}));

const { a11yRunner } = await import('./a11y-runner.js');

function engine(): EngineContext {
  return {
    projectRoot: 'project',
    fs: createFakeFileSystem({
      [join('project', '.qa', 'config.yaml')]: [
        'schemaVersion: 1',
        'testing: { e2e: undecided, api: out-of-scope, a11y: in-scope, security: undecided }',
        'environments:\n  staging: { baseUrl: "https://staging.example.com", allowlist: ["staging.example.com"] }',
        'identities: {}',
        'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
        'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
        'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
        '',
      ].join('\n'),
    }),
    clock: { now: () => new Date('2026-10-06T12:00:00Z') },
    logger: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeBrowserLauncher(),
    env: {},
  };
}

const INPUT = {
  runId: 'run-1',
  baseUrl: 'https://staging.example.com/',
  specFiles: ['/project/tests/a11y.spec.ts'],
};

beforeEach(() => {
  runPlaywrightSpecs.mockReset();
});

describe('a11yRunner', () => {
  it('declares the a11y test type', () => {
    expect(a11yRunner.testType).toBe('a11y');
  });

  it('runs the specs with the scan plan in their environment and classifies what they attached', async () => {
    runPlaywrightSpecs.mockResolvedValue([
      {
        result: {
          schemaVersion: 1,
          id: 'run-result-1',
          runId: 'run-1',
          testCaseId: 'case-1',
          testType: 'a11y',
          status: 'passed',
          startedAt: '2026-10-06T12:00:00.000Z',
          finishedAt: '2026-10-06T12:00:01.000Z',
          evidenceIds: [],
        },
        evidence: [{ kind: 'other', content: JSON.stringify({ violations: [{ id: 'image-alt' }] }) }],
      },
    ]);

    const outcomes = await a11yRunner.run(engine(), INPUT);

    const [, , testType, options] = runPlaywrightSpecs.mock.calls[0] ?? [];
    expect(testType).toBe('a11y');
    expect(options).toMatchObject({
      env: { [A11Y_SCAN_ENVIRONMENT_VARIABLE]: expect.any(String) as string },
    });
    expect(outcomes[0]?.result.status).toBe('failed');
  });
});
