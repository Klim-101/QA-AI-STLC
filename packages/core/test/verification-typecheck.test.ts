// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { SCHEMA_VERSION, type GeneratedTestSpec, type TestCase } from '@qa-ai-stlc/schemas';
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
import { toCanonicalJson } from '../src/json-file.js';
import { ManifestStore } from '../src/manifest-store.js';
import { QaStore } from '../src/qa-store.js';
import { registerVerifiedGeneratedTestSpec, verifyGeneratedTestSpec } from '../src/verification.js';

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

const TEST_CASE: TestCase = {
  schemaVersion: SCHEMA_VERSION,
  id: 'case-1',
  feature: 'checkout',
  requirementIds: ['req-1'],
  testType: 'e2e',
  title: 'A guest can check out',
  steps: [{ description: 'Add an item to the cart' }, { description: 'Complete checkout as a guest' }],
  expectedResult: 'The order confirmation page is shown',
  status: 'approved',
  createdAt: '2026-09-25T09:00:00Z',
};

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
  const store = new QaStore({ projectRoot: dir });
  const casePath = 'artifacts/cases/checkout/case-1.json';
  await store.writeJson(casePath, TEST_CASE);
  await new ManifestStore({ store }).register(casePath, toCanonicalJson(TEST_CASE));
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
  // The MCP server runs with the project root as its working directory, and a TypeScript project
  // almost always has a tsconfig.json there; TypeScript 6 rejects `tsc <files>` in that situation
  // (TS5112) unless the config is explicitly ignored.
  it('verifies from a working directory that contains a tsconfig.json', async () => {
    await withTempDir(async (dir) => {
      const context = await createProjectContext(dir);
      await nodeFileSystem.writeFile(
        join(dir, 'tsconfig.json'),
        '{ "compilerOptions": { "strict": false } }\n',
      );
      const originalCwd = process.cwd();
      process.chdir(dir);
      try {
        const verified = await verifyGeneratedTestSpec(context, {
          spec: spec(),
          testCase: TEST_CASE,
          runner: fakeRunner('passed'),
        });
        const broken = await verifyGeneratedTestSpec(context, {
          spec: spec({ content: 'export const total: number = "not a number";\n' }),
          testCase: TEST_CASE,
          runner: fakeRunner('passed'),
        });

        expect(verified.status).toBe('verified');
        expect(broken).toMatchObject({
          status: 'typecheck_failed',
          issues: [{ message: expect.stringContaining('TS2322') as string }],
        });
      } finally {
        process.chdir(originalCwd);
      }
    });
  }, 30_000);

  it('typechecks a real, well-typed generated spec and proceeds to execution', async () => {
    await withTempDir(async (dir) => {
      const context = await createProjectContext(dir);

      const outcome = await verifyGeneratedTestSpec(context, {
        spec: spec(),
        testCase: TEST_CASE,
        runner: fakeRunner('passed'),
      });

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

      const outcome = await verifyGeneratedTestSpec(context, {
        spec: brokenSpec,
        testCase: TEST_CASE,
        runner,
      });

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

  it('registers a spec only through the verification record the engine wrote for it', async () => {
    await withTempDir(async (dir) => {
      const context = await createProjectContext(dir);
      const verified = spec();
      const targetPath = join(dir, 'tests', 'qa', 'checkout', 'guest-checkout.spec.ts');

      await expect(
        registerVerifiedGeneratedTestSpec(context, verified, 'verification-never-ran'),
      ).rejects.toMatchObject({ code: 'core.verification.record_not_found' });
      expect(await nodeFileSystem.pathExists(targetPath)).toBe(false);

      const outcome = await verifyGeneratedTestSpec(context, {
        spec: verified,
        testCase: TEST_CASE,
        runner: fakeRunner('passed'),
      });
      await registerVerifiedGeneratedTestSpec(context, verified, outcome.verificationId);

      expect(await nodeFileSystem.readFile(targetPath)).toBe(verified.content);
      await expect(
        registerVerifiedGeneratedTestSpec(context, verified, outcome.verificationId),
      ).rejects.toMatchObject({ code: 'core.verification.already_consumed' });
    });
  }, 30_000);
});
