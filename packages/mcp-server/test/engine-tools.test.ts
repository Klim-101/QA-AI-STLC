// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { approveTool } from '../src/tools/approve.js';
import { caseResultRegisterTool } from '../src/tools/case-result-register.js';
import { casesAddTool } from '../src/tools/cases-add.js';
import { casesRenderTool } from '../src/tools/cases-render.js';
import { doctorTool } from '../src/tools/doctor.js';
import { exploreTool } from '../src/tools/explore.js';
import { httpExecuteTool } from '../src/tools/http-execute.js';
import { scopeTool } from '../src/tools/scope.js';
import { testDataAddTool } from '../src/tools/test-data-add.js';
import { validateTool } from '../src/tools/validate.js';

/** Starts a real local HTTP server on an OS-assigned port, so `qa.http_execute` makes a real call
 * without depending on the network or the demo app (that heavier exercise already lives in
 * `packages/core/test/case-execution-demo-app.test.ts`). */
async function withLocalServer(
  handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server: Server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected the local server to bind to a network address.');
  }
  try {
    await run(`http://127.0.0.1:${String(address.port)}/`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

// Every type decided (P2-16 blocks qa.scope/qa.cases_add while any is "undecided"); e2e in-scope
// since every case these tests register is testType "e2e".
const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
  'environments: {}',
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

async function writeConfig(projectRoot: string): Promise<void> {
  await mkdir(join(projectRoot, '.qa'), { recursive: true });
  await writeFile(join(projectRoot, '.qa', 'config.yaml'), CONFIG_YAML, 'utf-8');
}

// Every engine tool builds its `EngineContext` from `process.cwd()` (engine-context.ts), matching
// how a real MCP client's process is launched with the project root as its working directory.
// These tests run against a real temporary project directory instead of a fake `FileSystem` —
// exactly the "same core call" P2-05 promises the CLI, proven by driving the real Node adapters
// rather than a substitute (AGENTS.md 13: an integration test crossing a module boundary).
describe('engine-operation tools (real filesystem, temp project directory)', () => {
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  it('qa.doctor reports config missing in a project with no .qa/ store', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);

      const result = await doctorTool.handler({});
      const resultWithFixOption = await doctorTool.handler({ fix: false });
      process.chdir(originalCwd);

      expect(result.ok).toBe(false);
      expect(result.checks.some((check) => check.name === 'config' && check.status === 'fail')).toBe(true);
      expect(resultWithFixOption.ok).toBe(false);
    });
  });

  it('qa.explore throws CONFIG_MISSING in a project with no .qa/ store, whatever options are given', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);

      const errorWithNoOptions = await exploreTool.handler({}).catch((caught: unknown) => caught);
      const errorWithEveryOption = await exploreTool
        .handler({
          environment: 'staging',
          identity: 'admin',
          cdpEndpointUrl: 'ws://localhost:9222',
          policy: 'testid-first',
          static: true,
          maxPages: 5,
          verify: true,
        })
        .catch((caught: unknown) => caught);
      process.chdir(originalCwd);

      expect(errorWithNoOptions).toMatchObject({ code: 'CONFIG_MISSING' });
      expect(errorWithEveryOption).toMatchObject({ code: 'CONFIG_MISSING' });
    });
  });

  it('drives the whole scope -> cases_add -> approve -> validate pipeline against a real project', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);
      await writeConfig(projectRoot);
      await writeFile(join(projectRoot, 'requirements.md'), '## Login\nA user can log in.\n', 'utf-8');

      const scopeResult = await scopeTool.handler({ from: 'file', path: 'requirements.md' });
      expect(scopeResult).toEqual({ scopePath: 'artifacts/scope.json', added: 1, updated: 0, total: 1 });

      await writeFile(
        join(projectRoot, 'login-case.json'),
        JSON.stringify({
          id: 'login-case',
          feature: 'login',
          requirementIds: ['login'],
          testType: 'e2e',
          title: 'Log in with valid credentials',
          steps: [{ description: 'Submit the login form' }],
          expectedResult: 'The user lands on the dashboard',
          status: 'draft',
          createdAt: '2026-09-20T12:00:00Z',
        }),
        'utf-8',
      );

      const casesResult = await casesAddTool.handler({ path: 'login-case.json' });
      expect(casesResult).toEqual({
        casePath: 'artifacts/cases/login/login-case.json',
        id: 'login-case',
        requirementIds: ['login'],
      });

      const approveResult = await approveTool.handler({
        gate: 'scope',
        artifactPath: scopeResult.scopePath,
        approvedBy: 'test',
      });
      expect(approveResult.gate).toBe('scope');
      expect(approveResult.state.gates.scope.status).toBe('satisfied');

      const reapproveResult = await approveTool.handler({
        gate: 'scope',
        artifactPath: scopeResult.scopePath,
        approvedBy: 'test',
        note: 'looks complete',
      });
      expect(reapproveResult.state.gates.scope.status).toBe('satisfied');

      const validateResult = await validateTool.handler({});
      expect(validateResult.reopened).toEqual([]);
      expect(validateResult.unlinkedCases).toEqual([]);
      expect(validateResult.state.gates.scope.status).toBe('satisfied');

      // Written directly, bypassing qa.cases_add's own check, to prove qa.validate re-sweeps
      // every already-registered case rather than trusting the check done at registration time.
      await mkdir(join(projectRoot, '.qa', 'artifacts', 'cases', 'login'), { recursive: true });
      await writeFile(
        join(projectRoot, '.qa', 'artifacts', 'cases', 'login', 'stale-case.json'),
        JSON.stringify({
          id: 'stale-case',
          feature: 'login',
          requirementIds: ['removed-later'],
          testType: 'e2e',
          title: 'A case whose requirement no longer exists',
          steps: [{ description: 'Do something' }],
          expectedResult: 'Something happens',
          status: 'draft',
          createdAt: '2026-09-20T12:00:00Z',
        }),
        'utf-8',
      );
      const revalidateResult = await validateTool.handler({});
      process.chdir(originalCwd);

      expect(revalidateResult.unlinkedCases).toEqual([
        {
          casePath: 'artifacts/cases/login/stale-case.json',
          id: 'stale-case',
          unlinkedRequirementIds: ['removed-later'],
        },
      ]);
    });
  });

  it('qa.cases_render renders a registered test case to Markdown by id', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);
      await writeConfig(projectRoot);
      await writeFile(join(projectRoot, 'requirements.md'), '## Login\nA user can log in.\n', 'utf-8');
      await scopeTool.handler({ from: 'file', path: 'requirements.md' });
      await writeFile(
        join(projectRoot, 'login-case.json'),
        JSON.stringify({
          id: 'login-case',
          feature: 'login',
          requirementIds: ['login'],
          testType: 'e2e',
          title: 'Log in with valid credentials',
          steps: [{ description: 'Submit the login form' }],
          expectedResult: 'The user lands on the dashboard',
          status: 'draft',
          createdAt: '2026-09-20T12:00:00Z',
        }),
        'utf-8',
      );
      await casesAddTool.handler({ path: 'login-case.json' });

      const result = await casesRenderTool.handler({ id: 'login-case' });
      const notFoundError = await casesRenderTool
        .handler({ id: 'missing-case' })
        .catch((caught: unknown) => caught);
      process.chdir(originalCwd);

      expect(result.casePath).toBe('artifacts/cases/login/login-case.json');
      expect(result.markdown).toContain('# Log in with valid credentials');
      expect(result.markdown).toContain('## Steps');
      expect(notFoundError).toMatchObject({ code: 'CASE_NOT_FOUND' });
    });
  });

  it('qa.test_data_add registers a reusable test-data set under its feature folder', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);
      await writeFile(
        join(projectRoot, 'card.json'),
        JSON.stringify({
          id: 'valid-checkout-card',
          feature: 'checkout',
          values: { cardNumber: '4111111111111111', expiry: '12/30' },
        }),
        'utf-8',
      );

      const result = await testDataAddTool.handler({ path: 'card.json' });
      process.chdir(originalCwd);

      expect(result).toEqual({
        testDataPath: 'artifacts/test-data/checkout/valid-checkout-card.json',
        id: 'valid-checkout-card',
      });
    });
  });

  it('rejects a hand-edited scope artifact on the next MCP mutation and reports it from qa.validate (P2-07)', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);
      await writeConfig(projectRoot);
      await writeFile(join(projectRoot, 'requirements.md'), '## Login\nA user can log in.\n', 'utf-8');
      await scopeTool.handler({ from: 'file', path: 'requirements.md' });

      // Simulates an operator or a bug editing the artifact directly, bypassing every engine tool.
      await writeFile(
        join(projectRoot, '.qa', 'artifacts', 'scope.json'),
        JSON.stringify({ generatedAt: '2026-09-20T12:00:00Z', requirements: [] }),
        'utf-8',
      );

      const scopeError = await scopeTool
        .handler({ from: 'text', content: '## Signup\nbody\n', label: 'operator' })
        .catch((caught: unknown) => caught);

      await writeFile(
        join(projectRoot, 'case.json'),
        JSON.stringify({
          id: 'case-1',
          feature: 'checkout',
          requirementIds: ['login'],
          testType: 'e2e',
          title: 'A case',
          steps: [{ description: 'Do something' }],
          expectedResult: 'Something happens',
          status: 'draft',
          createdAt: '2026-09-20T12:00:00Z',
        }),
        'utf-8',
      );
      const casesAddError = await casesAddTool
        .handler({ path: 'case.json' })
        .catch((caught: unknown) => caught);

      const validateResult = await validateTool.handler({});
      process.chdir(originalCwd);

      expect(scopeError).toMatchObject({ code: 'ARTIFACT_HASH_MISMATCH' });
      expect(casesAddError).toMatchObject({ code: 'ARTIFACT_HASH_MISMATCH' });
      expect(validateResult.tamperedArtifacts).toEqual(['artifacts/scope.json']);
    });
  });

  it('qa.cases_add rejects a case linking to a requirement missing from the scope artifact', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);
      await writeConfig(projectRoot);
      await scopeTool.handler({ from: 'text', content: '## Known\nbody\n', label: 'operator' });
      await writeFile(
        join(projectRoot, 'bad-case.json'),
        JSON.stringify({
          id: 'bad-case',
          feature: 'checkout',
          requirementIds: ['does-not-exist'],
          testType: 'e2e',
          title: 'A case',
          steps: [{ description: 'Do something' }],
          expectedResult: 'Something happens',
          status: 'draft',
          createdAt: '2026-09-20T12:00:00Z',
        }),
        'utf-8',
      );

      const error = await casesAddTool.handler({ path: 'bad-case.json' }).catch((caught: unknown) => caught);
      process.chdir(originalCwd);

      expect(error).toMatchObject({ code: 'CASE_UNLINKED_REQUIREMENT' });
    });
  });

  it('qa.http_execute makes a real call and registers the request/response as evidence', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);

      await withLocalServer(
        (_req, res) => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('{"ok":true}');
        },
        async (baseUrl) => {
          // The allowlist must match this run's OS-assigned local port (#364), so config.yaml is
          // written here, once the real baseUrl is known, rather than reused from `CONFIG_YAML`.
          await mkdir(join(projectRoot, '.qa'), { recursive: true });
          await writeFile(
            join(projectRoot, '.qa', 'config.yaml'),
            [
              'schemaVersion: 1',
              // http_execute does not check testing.<type> scope itself (unlike qa.cases_add), so
              // any decided value avoids the schema's own "api requires an api: block" refinement.
              'testing: { e2e: undecided, api: out-of-scope, a11y: undecided, security: undecided }',
              'environments:',
              `  local: { baseUrl: "${baseUrl}", allowlist: ["127.0.0.1"] }`,
              'identities: {}',
              'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
              'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
              'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
              '',
            ].join('\n'),
            'utf-8',
          );

          const result = await httpExecuteTool.handler({ runId: 'run-1', url: baseUrl });
          const rejected = await httpExecuteTool
            .handler({ runId: 'run-1', url: 'https://evil.test/' })
            .catch((caught: unknown) => caught);

          expect(result.status).toBe(200);
          expect(result.evidence.runId).toBe('run-1');
          expect(rejected).toMatchObject({ code: 'BROWSER_URL_NOT_ALLOWED' });
        },
      );
      process.chdir(originalCwd);
    });
  });

  it('qa.case_result_register ties evidence ids together into a registered run result', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);

      // Well in the past, so this test never flakes on "finishedAt (real clock) must not be
      // earlier than startedAt" (RunResultSchema) around whatever moment it actually runs.
      const startedAt = '2020-01-01T00:00:00.000Z';
      const result = await caseResultRegisterTool.handler({
        testCaseId: 'login-case',
        testType: 'e2e',
        runId: 'run-1',
        status: 'passed',
        startedAt,
        evidenceIds: ['evidence-1', 'evidence-2'],
      });
      const failureResult = await caseResultRegisterTool.handler({
        testCaseId: 'login-case',
        testType: 'e2e',
        runId: 'run-1',
        status: 'failed',
        startedAt,
        evidenceIds: ['evidence-1'],
        failure: { message: 'expected element not found' },
      });
      process.chdir(originalCwd);

      expect(result.runResultPath).toBe(`runs/login-case/${result.id}.json`);
      expect(failureResult.id).not.toBe(result.id);
    });
  });
});
