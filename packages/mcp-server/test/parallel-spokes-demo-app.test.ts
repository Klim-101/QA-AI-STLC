// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { casesAddTool } from '../src/tools/cases-add.js';
import { exploreTool } from '../src/tools/explore.js';
import { generationRegisterTool } from '../src/tools/generation-register.js';
import { generationSpokeInputTool } from '../src/tools/generation-spoke-input.js';
import { generationVerifyTool } from '../src/tools/generation-verify.js';
import { scopeTool } from '../src/tools/scope.js';
import { runMetricsTool } from '../src/tools/run-metrics.js';
import { spokeListTool } from '../src/tools/spoke-list.js';
import { spokeRecordInputTool } from '../src/tools/spoke-record-input.js';
import { spokeRecordOutputTool } from '../src/tools/spoke-record-output.js';
import { validateTool } from '../src/tools/validate.js';

// Own port: test files run in parallel (AGENTS.md 13).
const PORT = 4694;
const BASE_URL = `http://localhost:${String(PORT)}/`;
const STARTUP_TIMEOUT_MS = 60_000;
const RUN_ID = 'parallel-run';

let demoApp: ManagedServer;

// A scratch project inside the checkout so a generated spec resolves `@playwright/test` (see
// generation-demo-app.test.ts).
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PROJECT_ROOT = join(REPO_ROOT, '.parallel-spokes-scratch');

const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
  'environments:',
  `  staging: { baseUrl: "${BASE_URL}login", allowlist: ["localhost"] }`,
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 4, spokeTimeoutSeconds: 120, retries: 1 }',
  '',
].join('\n');

const CASES = [
  {
    id: 'login-works',
    feature: 'login',
    title: 'A registered user can log in',
    steps: [{ description: 'Submit valid credentials' }],
    expectedResult: 'The dashboard greets the logged-in user',
  },
  {
    id: 'login-form',
    feature: 'login-form',
    title: 'The login page offers a log in button',
    steps: [{ description: 'Open the login page' }],
    expectedResult: 'The log in button is visible',
  },
] as const;

function specFor(testCaseId: string, title: string, stepTitle: string, body: readonly string[]): string {
  return [
    "import { expect, test } from '@playwright/test';",
    '',
    `test('${title}', {`,
    '  annotation: [',
    `    { type: 'testCaseId', description: '${testCaseId}' },`,
    "    { type: 'stepIds', description: 'step-1,expected-result' },",
    '  ],',
    '}, async ({ page }) => {',
    `  await test.step('[step-1] ${stepTitle}', async () => {`,
    ...body.slice(0, 1).map((line) => `    ${line}`),
    '  });',
    "  await test.step('[expected-result] Checked', async () => {",
    ...body.slice(1).map((line) => `    ${line}`),
    '  });',
    '});',
    '',
  ].join('\n');
}

const SPECS: Readonly<Record<string, { readonly path: string; readonly content: string }>> = {
  'login-works': {
    path: 'tests/qa/generated/login-works.spec.ts',
    content: specFor('login-works', 'a registered user can log in', 'Submit valid credentials', [
      "await page.goto('/login');",
      "await page.fill('#email', 'admin@example.com');",
      "await page.fill('input[name=\"password\"]', 'admin123');",
      "await page.getByRole('button', { name: 'Log in' }).click();",
      'await expect(page).toHaveURL(/\\/dashboard/);',
      "await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();",
    ]),
  },
  'login-form': {
    path: 'tests/qa/generated/login-form.spec.ts',
    content: specFor('login-form', 'the login page offers a log in button', 'Open the login page', [
      "await page.goto('/login');",
      "await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();",
    ]),
  },
};

let originalCwd: string;

beforeAll(async () => {
  demoApp = await startDemoApp(PORT);
  originalCwd = process.cwd();
  await rm(PROJECT_ROOT, { recursive: true, force: true });
  await mkdir(join(PROJECT_ROOT, '.qa'), { recursive: true });
  await writeFile(join(PROJECT_ROOT, '.qa', 'config.yaml'), CONFIG_YAML, 'utf-8');
  process.chdir(PROJECT_ROOT);
  await scopeTool.handler({
    from: 'text',
    label: 'login',
    content: '## Login\nA registered user can log in with valid credentials.\n',
  });
  await exploreTool.handler({ environment: 'staging' });
}, STARTUP_TIMEOUT_MS + 15_000);

afterAll(async () => {
  await demoApp.stop();
  process.chdir(originalCwd);
  await rm(PROJECT_ROOT, { recursive: true, force: true });
});

function dispatch(spokeId: string, taskId: string) {
  return spokeRecordInputTool.handler({ runId: RUN_ID, spokeId, taskId, task: `Do ${taskId}` });
}

function finish(spokeId: string, taskId: string, attempt: number) {
  return spokeRecordOutputTool.handler({
    runId: RUN_ID,
    attempt,
    result: { schemaVersion: 1, spokeId, taskId, status: 'ok', payload: {} },
  });
}

// What a hub does on Claude Code when `agents.parallelism` allows it: dispatches several spokes of
// one kind at once and each of them calls engine tools in the same session. There is no model here;
// each "spoke" is the sequence of engine calls it would make, run concurrently, so what is under
// test is the engine surviving concurrent spokes (P4-04), not the agents.
describe('parallel spokes (demo app, no LLM)', () => {
  it(
    'registers cases from parallel test-design spokes without losing one',
    async () => {
      const designed = ['design-a', 'design-b', 'design-c', 'design-d'].map((taskId, index) => ({
        taskId,
        testCase: {
          id: `designed-${String(index)}`,
          feature: `feature-${String(index)}`,
          requirementIds: ['login'],
          testType: 'e2e',
          title: `Designed case ${String(index)}`,
          steps: [{ description: 'Open the login page' }],
          expectedResult: 'The page is shown',
          status: 'approved',
          createdAt: '2026-10-16T09:00:00Z',
        },
      }));

      await Promise.all(
        designed.map(async ({ taskId, testCase }) => {
          const recorded = await dispatch('test-design', taskId);
          const path = `${testCase.id}.json`;
          await writeFile(join(PROJECT_ROOT, path), JSON.stringify(testCase), 'utf-8');
          await casesAddTool.handler({ path });
          await finish('test-design', taskId, recorded.attempt);
        }),
      );

      const manifest = JSON.parse(await readFile(join(PROJECT_ROOT, '.qa', 'manifest.json'), 'utf-8')) as {
        artifacts: Record<string, unknown>;
      };
      for (const { testCase } of designed) {
        expect(manifest.artifacts).toHaveProperty(`artifacts/cases/${testCase.feature}/${testCase.id}.json`);
      }
      const listed = await spokeListTool.handler({ runId: RUN_ID });
      expect(listed.records.filter((record) => record.status === 'ok')).toHaveLength(4);
      const report = await validateTool.handler({});
      expect(report.tamperedArtifacts).toEqual([]);
    },
    STARTUP_TIMEOUT_MS,
  );

  it(
    'keeps what both of two parallel explorer spokes found',
    async () => {
      const [tasks, dashboard] = await Promise.all([
        exploreTool.handler({ environment: 'staging', startUrls: ['/tasks'] }),
        exploreTool.handler({ environment: 'staging', startUrls: ['/dashboard'] }),
      ]);
      const readIds = async (): Promise<readonly string[]> =>
        (
          JSON.parse(await readFile(join(PROJECT_ROOT, '.qa', 'selectors', 'registry.json'), 'utf-8')) as {
            elements: { elementId: string }[];
          }
        ).elements.map((element) => element.elementId);
      const afterParallel = await readIds();

      // The same crawls one after the other add nothing the parallel pair had lost.
      await exploreTool.handler({ environment: 'staging', startUrls: ['/tasks'] });
      await exploreTool.handler({ environment: 'staging', startUrls: ['/dashboard'] });
      const afterSequential = await readIds();

      expect(afterParallel.toSorted()).toEqual(afterSequential.toSorted());
      expect(tasks.elementCount).toBeGreaterThan(0);
      expect(dashboard.elementCount).toBeGreaterThan(0);
      const report = await validateTool.handler({});
      expect(report.tamperedArtifacts).toEqual([]);
    },
    STARTUP_TIMEOUT_MS * 2,
  );

  it(
    'verifies and registers specs from parallel generation spokes',
    async () => {
      for (const testCase of CASES) {
        await writeFile(
          join(PROJECT_ROOT, `${testCase.id}.json`),
          JSON.stringify({
            ...testCase,
            requirementIds: ['login'],
            testType: 'e2e',
            status: 'approved',
            createdAt: '2026-10-16T09:00:00Z',
          }),
          'utf-8',
        );
        await casesAddTool.handler({ path: `${testCase.id}.json` });
      }

      const registered = await Promise.all(
        CASES.map(async (testCase) => {
          const recorded = await dispatch('test-generation', testCase.id);
          const spokeInput = await generationSpokeInputTool.handler({
            testCaseId: testCase.id,
            elementIds: [],
          });
          const spec = SPECS[testCase.id];
          if (spec === undefined) {
            throw new Error('missing spec fixture');
          }
          const outcome = await generationVerifyTool.handler({
            input: spokeInput,
            content: spec.content,
            filePath: spec.path,
            generatorVersion: spokeInput.locatorModule?.generatorVersion ?? 'unknown',
          });
          if (outcome.status !== 'verified' || outcome.spec === undefined) {
            throw new Error(`${testCase.id} was not verified: ${outcome.status}`);
          }
          const result = await generationRegisterTool.handler({
            spec: outcome.spec,
            verificationId: outcome.verificationId,
          });
          await finish('test-generation', testCase.id, recorded.attempt);
          return result.filePath;
        }),
      );

      const manifest = JSON.parse(await readFile(join(PROJECT_ROOT, '.qa', 'manifest.json'), 'utf-8')) as {
        artifacts: Record<string, unknown>;
      };
      for (const filePath of registered) {
        expect(manifest.artifacts).toHaveProperty(filePath);
      }
      const report = await validateTool.handler({});
      expect(report.tamperedArtifacts).toEqual([]);
    },
    STARTUP_TIMEOUT_MS * 3,
  );

  it('refuses a dispatch past agents.parallelism while its spokes are still running', async () => {
    const running = ['busy-a', 'busy-b', 'busy-c', 'busy-d'].map((taskId) => dispatch('explorer', taskId));
    await Promise.all(running);

    const fifth = await dispatch('explorer', 'busy-e').catch((caught: unknown) => caught);

    expect(fifth).toMatchObject({ code: 'SPOKE_PARALLELISM_EXCEEDED' });
  });

  it('measures the run exactly as the spoke store and the budgets hold it (P4-10)', async () => {
    const listed = await spokeListTool.handler({ runId: RUN_ID });

    const metrics = await runMetricsTool.handler({ runId: RUN_ID });

    expect(metrics.budgets).toEqual({ parallelism: 4, spokeTimeoutSeconds: 120, retries: 1 });
    expect(metrics.dispatch).toMatchObject({
      attempts: listed.records.length,
      okResponses: listed.records.filter((record) => record.status === 'ok').length,
      errorResponses: listed.records.filter((record) => record.status === 'error').length,
      unanswered: listed.records.filter((record) => record.status === undefined).length,
    });
    expect(metrics.dispatch.bySpoke.map((spoke) => spoke.spokeId)).toEqual(
      [...new Set(listed.records.map((record) => record.spokeId))].sort(),
    );
    expect(metrics.retries.tasksOverBudget).toBe(0);
    expect(metrics.concurrency).toMatchObject({ isWithinBudget: true });
    expect(metrics.concurrency.peak).toBeGreaterThan(1);
    expect(metrics.timing.overlapSavingMs).toBeGreaterThanOrEqual(0);
    expect(Object.keys(metrics).filter((key) => /token|cost/iu.test(key))).toEqual([]);
  });
});
