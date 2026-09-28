// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { approveTool } from '../src/tools/approve.js';
import { caseResultRegisterTool } from '../src/tools/case-result-register.js';
import { casesAddTool } from '../src/tools/cases-add.js';
import { casesRenderTool } from '../src/tools/cases-render.js';
import { configShowTool } from '../src/tools/config-show.js';
import { doctorTool } from '../src/tools/doctor.js';
import { exploreTool } from '../src/tools/explore.js';
import { generationProvenSessionTool } from '../src/tools/generation-proven-session.js';
import { generationRegisterTool } from '../src/tools/generation-register.js';
import { generationSpokeInputTool } from '../src/tools/generation-spoke-input.js';
import { generationVerifyTool } from '../src/tools/generation-verify.js';
import { httpExecuteTool } from '../src/tools/http-execute.js';
import { linkTool } from '../src/tools/link.js';
import { reportTool } from '../src/tools/report.js';
import { runTool } from '../src/tools/run.js';
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

// Registers "checkout-case" through the real scope -> cases_add path and returns it exactly as the
// engine stored it, which is what qa.generation_verify requires its input's testCase to match.
async function registerCheckoutCase(projectRoot: string): Promise<Record<string, unknown>> {
  await writeConfig(projectRoot);
  await writeFile(join(projectRoot, 'requirements.md'), '## Checkout\nA guest can check out.\n', 'utf-8');
  await scopeTool.handler({ from: 'file', path: 'requirements.md' });
  await writeFile(
    join(projectRoot, 'checkout-case.json'),
    JSON.stringify({
      id: 'checkout-case',
      feature: 'checkout',
      requirementIds: ['checkout'],
      testType: 'e2e',
      title: 'Guest checkout',
      steps: [{ description: 'Complete checkout' }],
      expectedResult: 'Order confirmed',
      status: 'draft',
      createdAt: '2026-09-20T12:00:00Z',
    }),
    'utf-8',
  );
  const { casePath } = await casesAddTool.handler({ path: 'checkout-case.json' });
  return JSON.parse(await readFile(join(projectRoot, '.qa', casePath), 'utf-8')) as Record<string, unknown>;
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
      expect(result.relaxations).toStrictEqual([]);
      expect(resultWithFixOption.ok).toBe(false);
    });
  });

  it('qa.doctor reports every relaxation the local configuration layer introduces (P6-24)', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);
      await writeConfig(projectRoot);
      await writeFile(
        join(projectRoot, '.qa', 'config.local.yaml'),
        'environments:\n  dev:\n    baseUrl: http://localhost:4310\n    allowlist: [localhost]\n',
        'utf-8',
      );

      const result = await doctorTool.handler({});
      process.chdir(originalCwd);

      expect(result.relaxations).toStrictEqual([
        {
          kind: 'allowlist-entry',
          environment: 'dev',
          hostname: 'localhost',
          localLayerPath: '.qa/config.local.yaml',
        },
      ]);
    });
  });

  it('qa.config_show omits localLayerPath and lists no relaxations with no local layer', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);
      await writeConfig(projectRoot);

      const result = await configShowTool.handler({});
      process.chdir(originalCwd);

      expect(result.localLayerPath).toBeUndefined();
      expect(result.relaxations).toStrictEqual([]);
      expect(result.values).toContainEqual({
        path: ['testing', 'e2e'],
        value: 'in-scope',
        layer: 'committed',
      });
    });
  });

  it('qa.config_show reports the source layer, the local file and the relaxations of a merged configuration', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);
      await writeConfig(projectRoot);
      await writeFile(
        join(projectRoot, '.qa', 'config.local.yaml'),
        'agents:\n  parallelism: 2\nenvironments:\n  dev:\n    baseUrl: http://localhost:4310\n    allowlist: [localhost]\n    tlsInsecure: true\n',
        'utf-8',
      );

      const result = await configShowTool.handler({});
      process.chdir(originalCwd);

      expect(result.localLayerPath).toBe('.qa/config.local.yaml');
      expect(result.config.agents.parallelism).toBe(2);
      expect(result.values).toContainEqual({
        path: ['agents', 'parallelism'],
        value: 2,
        layer: 'local',
      });
      expect(result.values).toContainEqual({
        path: ['testing', 'e2e'],
        value: 'in-scope',
        layer: 'committed',
      });
      expect(result.relaxations).toStrictEqual([
        {
          kind: 'allowlist-entry',
          environment: 'dev',
          hostname: 'localhost',
          localLayerPath: '.qa/config.local.yaml',
        },
        { kind: 'tls-insecure', environment: 'dev', localLayerPath: '.qa/config.local.yaml' },
      ]);
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

  it('qa.link registers a hand-written spec in traceability, reusing its own testCaseId annotation', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);
      await writeConfig(projectRoot);
      await writeFile(join(projectRoot, 'requirements.md'), '## Login\nA user can log in.\n', 'utf-8');
      await scopeTool.handler({ from: 'file', path: 'requirements.md' });

      await mkdir(join(projectRoot, 'tests'), { recursive: true });
      await writeFile(
        join(projectRoot, 'tests', 'login.spec.ts'),
        [
          "import { test } from '@playwright/test';",
          "test('logs in', { annotation: { type: 'testCaseId', description: 'hand-written-login' } }, async () => {});",
          '',
        ].join('\n'),
        'utf-8',
      );

      const linkResult = await linkTool.handler({
        specFile: 'tests/login.spec.ts',
        requirementId: 'login',
        feature: 'login',
      });
      process.chdir(originalCwd);

      expect(linkResult).toEqual({
        testCaseId: 'hand-written-login',
        casePath: 'artifacts/cases/login/hand-written-login.json',
        requirementId: 'login',
        annotationFound: true,
      });
    });
  });

  it('qa.link honors an explicit testType', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);
      await writeConfig(projectRoot);
      await writeFile(join(projectRoot, 'requirements.md'), '## Login\nA user can log in.\n', 'utf-8');
      await scopeTool.handler({ from: 'file', path: 'requirements.md' });

      await mkdir(join(projectRoot, 'tests'), { recursive: true });
      await writeFile(
        join(projectRoot, 'tests', 'login.spec.ts'),
        [
          "import { test } from '@playwright/test';",
          "test('logs in', { annotation: { type: 'testCaseId', description: 'hand-written-login' } }, async () => {});",
          '',
        ].join('\n'),
        'utf-8',
      );

      const linkResult = await linkTool.handler({
        specFile: 'tests/login.spec.ts',
        requirementId: 'login',
        feature: 'login',
        testType: 'e2e',
      });
      process.chdir(originalCwd);

      expect(linkResult.testCaseId).toBe('hand-written-login');
    });
  });

  it('qa.validate does not sweep run results unless "checkRuns" is requested, and fails on a fabricated evidence link when it is (P3-09)', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);
      await writeConfig(projectRoot);

      await mkdir(join(projectRoot, '.qa', 'runs', 'run-1', 'results'), { recursive: true });
      await writeFile(
        join(projectRoot, '.qa', 'runs', 'run-1', 'results', 'result-1.json'),
        JSON.stringify({
          id: 'result-1',
          runId: 'run-1',
          testCaseId: 'login-case',
          testType: 'e2e',
          status: 'passed',
          startedAt: '2026-09-25T09:59:00.000Z',
          finishedAt: '2026-09-25T10:00:00.000Z',
          evidenceIds: ['fabricated'],
        }),
        'utf-8',
      );

      const withoutCheck = await validateTool.handler({});
      const withCheck = await validateTool.handler({ checkRuns: true });
      process.chdir(originalCwd);

      expect(withoutCheck.unresolvedResultEvidence).toBeUndefined();
      expect(withCheck.unresolvedResultEvidence).toEqual([
        {
          resultPath: 'runs/run-1/results/result-1.json',
          id: 'result-1',
          unresolvedEvidenceIds: ['fabricated'],
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

          const result = await httpExecuteTool.handler({ runId: 'run-1', url: baseUrl, stepId: 'step-1' });
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

  it('qa.http_execute has no TLS input, so a caller cannot turn certificate validation off', () => {
    // The MCP SDK validates input against this schema's shape, which strips unknown keys; a
    // caller-supplied tlsInsecure therefore never reaches the handler (ADR-011).
    const parsed = httpExecuteTool.inputSchema.parse({
      runId: 'run-1',
      url: 'https://staging.example.test/',
      tlsInsecure: true,
    });

    expect(Object.keys(httpExecuteTool.inputSchema.shape)).not.toContain('tlsInsecure');
    expect(parsed).not.toHaveProperty('tlsInsecure');
  });

  it('qa.case_result_register ties evidence ids together into a registered run result', async () => {
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
          steps: [{ description: 'Click the login button' }],
          expectedResult: 'The user lands on the dashboard',
          status: 'draft',
          createdAt: '2026-09-20T12:00:00Z',
        }),
        'utf-8',
      );
      await casesAddTool.handler({ path: 'login-case.json' });

      // Evidence content is what a real browser/http execution tool would have registered —
      // written directly here, the same way this file's qa.generation_proven_session test seeds
      // evidence, rather than driving a real browser or HTTP call for a check-only test.
      await mkdir(join(projectRoot, '.qa', 'evidence', 'run-1'), { recursive: true });
      await writeFile(join(projectRoot, '.qa', 'evidence', 'run-1', 'evidence-1.json'), '{}', 'utf-8');
      await writeFile(join(projectRoot, '.qa', 'evidence', 'run-1', 'evidence-2.json'), '{}', 'utf-8');

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

  it('qa.case_result_register rejects a testCaseId with no registered test case', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);
      await writeConfig(projectRoot);

      const rejected = await caseResultRegisterTool
        .handler({
          testCaseId: 'no-such-case',
          testType: 'e2e',
          runId: 'run-1',
          status: 'passed',
          startedAt: '2020-01-01T00:00:00.000Z',
          evidenceIds: [],
        })
        .catch((caught: unknown) => caught);
      process.chdir(originalCwd);

      expect(rejected).toMatchObject({ code: 'CASE_NOT_FOUND' });
    });
  });

  it('qa.generation_proven_session recovers a proven qa-execute session for qa-generate-tests (P3-07)', async () => {
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
          steps: [{ description: 'Click the login button' }, { description: 'Observe the dashboard' }],
          expectedResult: 'The user lands on the dashboard',
          status: 'draft',
          createdAt: '2026-09-20T12:00:00Z',
        }),
        'utf-8',
      );
      await casesAddTool.handler({ path: 'login-case.json' });

      const notYetExecuted = await generationProvenSessionTool.handler({ testCaseId: 'login-case' });

      // Evidence content is what qa.browser_click/qa.browser_navigate would have registered during
      // a real qa-execute session (P3-15) — written directly here, the same way this file already
      // seeds run results elsewhere, rather than driving a real browser in an MCP-tool-level test.
      await mkdir(join(projectRoot, '.qa', 'evidence', 'run-1'), { recursive: true });
      await writeFile(
        join(projectRoot, '.qa', 'evidence', 'run-1', 'evidence-1.json'),
        JSON.stringify({
          type: 'click',
          sessionId: 'session-1',
          stepId: 'step-1',
          selector: 'role=button[name="Log in"]',
          at: '2026-09-25T09:59:30.000Z',
        }),
        'utf-8',
      );
      await writeFile(
        join(projectRoot, '.qa', 'evidence', 'run-1', 'evidence-2.json'),
        JSON.stringify({
          type: 'navigate',
          sessionId: 'session-1',
          stepId: 'step-2',
          url: 'https://staging.example.test/dashboard',
          at: '2026-09-25T09:59:45.000Z',
        }),
        'utf-8',
      );
      await caseResultRegisterTool.handler({
        testCaseId: 'login-case',
        testType: 'e2e',
        runId: 'run-1',
        status: 'passed',
        startedAt: '2026-09-25T09:59:00.000Z',
        evidenceIds: ['evidence-1', 'evidence-2'],
      });

      const executed = await generationProvenSessionTool.handler({ testCaseId: 'login-case' });
      process.chdir(originalCwd);

      expect(notYetExecuted).toEqual({ found: false });
      expect(executed.found).toBe(true);
      expect(executed.session?.steps.map((step) => step.stepId)).toEqual(['step-1', 'step-2']);
      expect(executed.session?.steps[0]?.description).toBe('Click the login button');
    });
  });

  it('qa.generation_spoke_input rejects an unregistered testCaseId', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);

      const rejected = await generationSpokeInputTool
        .handler({ testCaseId: 'no-such-case', elementIds: [] })
        .catch((caught: unknown) => caught);

      process.chdir(originalCwd);

      expect(rejected).toMatchObject({ code: 'CASE_NOT_FOUND' });
    });
  });

  it('qa.generation_spoke_input rejects a case with no generated locator module yet', async () => {
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
          steps: [{ description: 'Click the login button' }],
          expectedResult: 'The user lands on the dashboard',
          status: 'draft',
          createdAt: '2026-09-20T12:00:00Z',
        }),
        'utf-8',
      );
      await casesAddTool.handler({ path: 'login-case.json' });

      const rejected = await generationSpokeInputTool
        .handler({ testCaseId: 'login-case', elementIds: [] })
        .catch((caught: unknown) => caught);
      process.chdir(originalCwd);

      expect(rejected).toMatchObject({ code: 'GENERATION_LOCATOR_MODULE_MISSING' });
    });
  });

  it('qa.generation_spoke_input assembles a real spoke input from a registered case and locator module', async () => {
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
          steps: [{ description: 'Click the login button' }],
          expectedResult: 'The user lands on the dashboard',
          status: 'draft',
          createdAt: '2026-09-20T12:00:00Z',
        }),
        'utf-8',
      );
      await casesAddTool.handler({ path: 'login-case.json' });
      await mkdir(join(projectRoot, 'tests', 'qa'), { recursive: true });
      await writeFile(
        join(projectRoot, 'tests', 'qa', 'locators.ts'),
        'export const GENERATOR_VERSION = "1.3.0";\n',
        'utf-8',
      );

      const provenSession = {
        schemaVersion: 1 as const,
        testCaseId: 'login-case',
        runResultId: 'run-result-1',
        steps: [
          {
            stepId: 'step-1',
            description: 'Click the login button',
            actions: [
              {
                schemaVersion: 1 as const,
                type: 'click' as const,
                sessionId: 'session-1',
                stepId: 'step-1',
                at: '2026-09-20T12:00:00Z',
              },
            ],
          },
        ],
      };
      const input = await generationSpokeInputTool.handler({
        testCaseId: 'login-case',
        elementIds: [],
        provenSession,
      });
      process.chdir(originalCwd);

      expect(input.testCase.id).toBe('login-case');
      expect(input.registrySlice.elements).toEqual([]);
      expect(input.locatorModule).toEqual({ generatorVersion: '1.3.0', exports: [] });
      expect(input.provenSession?.runResultId).toBe('run-result-1');
    });
  });

  it('qa.generation_verify rejects a test type with no runner yet, before touching the project at all', async () => {
    const rejected = await generationVerifyTool
      .handler({
        input: {
          schemaVersion: 1,
          testCase: {
            schemaVersion: 1,
            id: 'api-case',
            feature: 'billing',
            requirementIds: ['req-1'],
            testType: 'api',
            title: 'Fetches the invoice',
            steps: [{ description: 'GET /invoice' }],
            expectedResult: 'Returns 200',
            status: 'approved',
            createdAt: '2026-09-20T12:00:00Z',
          },
          registrySlice: { schemaVersion: 1, generatedAt: '2026-09-20T12:00:00Z', elements: [] },
          locatorModule: { generatorVersion: '1.3.0', exports: [] },
        },
        content: 'export const GENERATOR_VERSION = "1.3.0";\n',
        filePath: 'tests/qa/billing/invoice.spec.ts',
        generatorVersion: '1.3.0',
      })
      .catch((caught: unknown) => caught);

    expect(rejected).toMatchObject({ code: 'RUN_TEST_TYPE_UNSUPPORTED' });
  });

  it('qa.generation_verify reports typecheck_failed for a real type error, without touching the project', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);
      const testCase = await registerCheckoutCase(projectRoot);

      const outcome = await generationVerifyTool.handler({
        input: {
          schemaVersion: 1,
          testCase: testCase as never,
          registrySlice: { schemaVersion: 1, generatedAt: '2026-09-20T12:00:00Z', elements: [] },
          locatorModule: { generatorVersion: '1.3.0', exports: [] },
        },
        content: 'export const total: number = "not a number";\n',
        filePath: 'tests/qa/checkout/guest-checkout.spec.ts',
        generatorVersion: '1.3.0',
        // A typecheck failure never reaches environment resolution, but this still exercises
        // "environment" actually being forwarded, not just its absence.
        environment: 'staging',
      });
      const rejected = await generationRegisterTool
        .handler({
          spec: {
            schemaVersion: 1,
            testCaseId: 'checkout-case',
            generatorVersion: '1.3.0',
            filePath: 'tests/qa/checkout/guest-checkout.spec.ts',
            sourceHash: 'a'.repeat(64),
            generatedAt: '2026-09-27T10:00:00.000Z',
            content: 'export const total: number = "not a number";\n',
          },
          verificationId: outcome.verificationId,
        })
        .catch((caught: unknown) => caught);
      process.chdir(originalCwd);

      expect(outcome.status).toBe('typecheck_failed');
      expect(outcome.issues?.[0]?.message).toContain("Type 'string' is not assignable to type 'number'");
      expect(outcome.verificationId).toMatch(/^verification-/);
      expect(rejected).toMatchObject({ code: 'core.verification.not_verified' });
    });
  });

  // The P4-13 live repro: invalid TypeScript for a test case that does not exist, registered with
  // no verification ever having run. The caller can no longer supply a result or hash at all.
  it('qa.generation_register rejects a spec no verification ever ran for, writing nothing', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);
      await writeConfig(projectRoot);

      const rejected = await generationRegisterTool
        .handler({
          spec: {
            schemaVersion: 1,
            testCaseId: 'never-registered',
            generatorVersion: '1.3.0',
            filePath: 'tests/qa/never-verified.spec.ts',
            sourceHash: 'a'.repeat(64),
            generatedAt: '2026-09-28T10:00:00.000Z',
            content: 'this is not TypeScript at all {{{ ;;;',
          },
          verificationId: 'verification-made-up',
        })
        .catch((caught: unknown) => caught);
      process.chdir(originalCwd);

      expect(rejected).toMatchObject({ code: 'core.verification.record_not_found' });
      await expect(readFile(join(projectRoot, 'tests', 'qa', 'never-verified.spec.ts'))).rejects.toThrow();
      await expect(readFile(join(projectRoot, '.qa', 'manifest.json'))).rejects.toThrow();
    });
  });

  it('qa.run rejects a test type with no runner yet, before touching the project at all', async () => {
    const rejected = await runTool
      .handler({ specFiles: ['tests/login.playwright-spec.ts'], testType: 'api' })
      .catch((caught: unknown) => caught);

    expect(rejected).toMatchObject({ code: 'RUN_TEST_TYPE_UNSUPPORTED' });
  });

  it('qa.run reports config missing for the default e2e test type in an uninitialized project', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);

      const rejected = await runTool
        .handler({ specFiles: ['tests/login.playwright-spec.ts'] })
        .catch((caught: unknown) => caught);

      process.chdir(originalCwd);

      expect(rejected).toMatchObject({ code: 'CONFIG_MISSING' });
    });
  });

  it('qa.report renders the requested run’s summary and the traceability matrix', async () => {
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

      await mkdir(join(projectRoot, '.qa', 'runs', 'run-1', 'results'), { recursive: true });
      await writeFile(
        join(projectRoot, '.qa', 'runs', 'run-1', 'run.json'),
        JSON.stringify({
          id: 'run-1',
          testType: 'e2e',
          specFiles: ['tests/login.playwright-spec.ts'],
          baseUrl: 'https://staging.example.test/',
          startedAt: '2026-09-25T10:00:00.000Z',
          finishedAt: '2026-09-25T10:00:05.000Z',
          resultIds: ['result-1'],
          counts: { passed: 1, failed: 0, blocked: 0, skipped: 0, uncertain: 0, partial: 0 },
        }),
        'utf-8',
      );
      await writeFile(
        join(projectRoot, '.qa', 'runs', 'run-1', 'results', 'result-1.json'),
        JSON.stringify({
          id: 'result-1',
          runId: 'run-1',
          testCaseId: 'login-case',
          testType: 'e2e',
          status: 'passed',
          startedAt: '2026-09-25T10:00:00.000Z',
          finishedAt: '2026-09-25T10:00:05.000Z',
          evidenceIds: [],
        }),
        'utf-8',
      );

      const result = await reportTool.handler({ runId: 'run-1' });
      const htmlResult = await reportTool.handler({ format: 'html' });
      const notFoundError = await reportTool.handler({ runId: 'missing' }).catch((caught: unknown) => caught);
      process.chdir(originalCwd);

      expect(result.runId).toBe('run-1');
      expect(result.format).toBe('markdown');
      expect(result.runSummary).toContain('# Run summary: run-1');
      expect(result.traceabilityMatrix).toContain('Log in with valid credentials (login-case) | passed |');
      expect(htmlResult).toMatchObject({ runId: 'run-1', format: 'html' });
      expect(htmlResult.runSummary).toContain('<h1>Run summary: run-1</h1>');
      expect(notFoundError).toMatchObject({ code: 'REPORT_RUN_NOT_FOUND' });
    });
  });
});
