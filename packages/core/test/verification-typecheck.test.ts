// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { SCHEMA_VERSION, type GeneratedTestSpec } from '@qa-ai-stlc/schemas';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../src/engine-context.js';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { noopLogger } from '../src/ports/logger.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';
import { systemClock } from '../src/ports/clock.js';
import type { Runner } from '../src/runner.js';
import { verifyGeneratedTestSpec } from '../src/verification.js';

const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
  'environments:',
  '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

function spec(overrides: Partial<GeneratedTestSpec> = {}): GeneratedTestSpec {
  return {
    schemaVersion: SCHEMA_VERSION,
    testCaseId: 'case-1',
    generatorVersion: '0.1.0',
    filePath: 'tests/qa/checkout/guest-checkout.spec.ts',
    sourceHash: 'a'.repeat(64),
    generatedAt: '2026-09-25T12:00:00Z',
    content: 'export const total: number = 1 + 1;\n',
    ...overrides,
  };
}

// This never runs (`runner.run` is only reached once typecheck passes) except in the one test
// that needs a real result; kept as a shared fixture since its shape is verbose.
function fakeRunner(status: 'passed' | 'failed'): Runner {
  return {
    testType: 'e2e',
    run: (_engine, input) =>
      Promise.resolve([
        {
          result: {
            schemaVersion: SCHEMA_VERSION,
            id: 'result-1',
            runId: input.runId,
            testCaseId: 'case-1',
            testType: 'e2e',
            status,
            startedAt: '2026-09-25T12:00:00Z',
            finishedAt: '2026-09-25T12:00:01Z',
            evidenceIds: [],
            ...(status === 'failed' ? { failure: { message: 'boom' } } : {}),
          },
          evidence: [],
        },
      ]),
  };
}

async function createProjectContext(dir: string): Promise<EngineContext> {
  await nodeFileSystem.mkdir(join(dir, '.qa'));
  await nodeFileSystem.writeFile(join(dir, '.qa', 'config.yaml'), CONFIG_YAML);
  return {
    projectRoot: dir,
    fs: nodeFileSystem,
    clock: systemClock,
    logger: noopLogger,
    processRunner: nodeProcessRunner,
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeBrowserLauncher(),
    env: {},
  };
}

describe('verifyGeneratedTestSpec against the real TypeScript compiler', () => {
  it('typechecks a real, well-typed generated spec and proceeds to execution', async () => {
    await withTempDir(async (dir) => {
      const context = await createProjectContext(dir);

      const outcome = await verifyGeneratedTestSpec(context, { spec: spec(), runner: fakeRunner('passed') });

      expect(outcome.status).toBe('verified');
    });
  }, 30_000);

  it('rejects a deliberately broken generated spec and names the failing line, without executing it', async () => {
    await withTempDir(async (dir) => {
      const context = await createProjectContext(dir);
      let runnerCalled = false;
      const runner: Runner = {
        testType: 'e2e',
        run: () => {
          runnerCalled = true;
          return Promise.resolve([]);
        },
      };
      const brokenSpec = spec({ content: 'export const total: number = "not a number";\n' });

      const outcome = await verifyGeneratedTestSpec(context, { spec: brokenSpec, runner });

      expect(outcome.status).toBe('typecheck_failed');
      if (outcome.status === 'typecheck_failed') {
        expect(outcome.issues).toEqual([
          {
            path: [brokenSpec.filePath, 1, 14],
            message: expect.stringContaining("Type 'string' is not assignable to type 'number'") as string,
          },
        ]);
      }
      expect(runnerCalled).toBe(false);
      expect(await nodeFileSystem.pathExists(join(dir, 'tests', 'qa', 'checkout'))).toBe(true);
      expect(await nodeFileSystem.listFiles(join(dir, 'tests', 'qa', 'checkout'))).toEqual([]);
    });
  }, 30_000);
});
