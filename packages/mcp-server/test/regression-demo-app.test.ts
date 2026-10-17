// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, rm, writeFile } from 'node:fs/promises';
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
import { regressionPlanTool } from '../src/tools/regression-plan.js';
import { runTool } from '../src/tools/run.js';
import { scopeTool } from '../src/tools/scope.js';

// Own port: test files run in parallel (AGENTS.md 13).
const PORT = 4700;
const BASE_URL = `http://localhost:${String(PORT)}/`;
const STARTUP_TIMEOUT_MS = 60_000;

let demoApp: ManagedServer;

// A scratch project inside the checkout so a generated spec resolves `@playwright/test`.
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PROJECT_ROOT = join(REPO_ROOT, '.regression-demo-app-scratch');

const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
  'environments:',
  `  staging: { baseUrl: "${BASE_URL}login", allowlist: ["localhost"] }`,
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  'flaky: { historyWindow: 6, minStatusChanges: 2 }',
  '',
].join('\n');

const CASES = [
  { id: 'pack-login', tier: 'smoke' },
  { id: 'pack-greeting', tier: 'smoke' },
  { id: 'pack-flip', tier: 'smoke' },
  { id: 'pack-deep', tier: 'extended' },
] as const;

const SPEC = [
  "import { expect, test } from '@playwright/test';",
  '',
  'test(',
  "  'a registered user can log in',",
  '  {',
  '    annotation: [',
  "      { type: 'testCaseId', description: 'pack-login' },",
  "      { type: 'stepIds', description: 'step-1,expected-result' },",
  '    ],',
  '  },',
  '  async ({ page }) => {',
  "    await test.step('[step-1] Submit valid credentials', async () => {",
  "      await page.goto('/login');",
  "      await page.fill('#email', 'admin@example.com');",
  "      await page.fill('input[name=\"password\"]', 'admin123');",
  "      await page.getByRole('button', { name: 'Log in' }).click();",
  '    });',
  "    await test.step('[expected-result] The dashboard loads', async () => {",
  '      await expect(page).toHaveURL(/\\/dashboard/);',
  '    });',
  '  },',
  ');',
  '',
].join('\n');

let originalCwd: string;

function historicalResult(id: string, status: 'passed' | 'failed', minute: number): string {
  const at = `2026-10-10T10:0${String(minute)}:00Z`;
  return JSON.stringify({
    schemaVersion: 1,
    id,
    runId: 'history',
    testCaseId: 'pack-flip',
    testType: 'e2e',
    status,
    startedAt: at,
    finishedAt: at,
    evidenceIds: [],
    ...(status === 'failed' ? { failure: { message: 'boom' } } : {}),
  });
}

beforeAll(async () => {
  demoApp = await startDemoApp(PORT);
  originalCwd = process.cwd();
  await rm(PROJECT_ROOT, { recursive: true, force: true });
  await mkdir(join(PROJECT_ROOT, '.qa', 'runs', 'history', 'results'), { recursive: true });
  await writeFile(join(PROJECT_ROOT, '.qa', 'config.yaml'), CONFIG_YAML, 'utf-8');
  process.chdir(PROJECT_ROOT);
  await scopeTool.handler({
    from: 'text',
    label: 'login',
    content: '## Login\nA registered user can log in with valid credentials.\n',
  });
  for (const testCase of CASES) {
    await writeFile(
      join(PROJECT_ROOT, `${testCase.id}.json`),
      JSON.stringify({
        id: testCase.id,
        feature: testCase.id,
        requirementIds: ['login'],
        testType: 'e2e',
        title: `Case ${testCase.id}`,
        steps: [{ description: 'Submit valid credentials' }],
        expectedResult: 'The dashboard loads',
        regressionTier: testCase.tier,
        status: 'approved',
        createdAt: '2026-10-17T09:00:00Z',
      }),
      'utf-8',
    );
    await casesAddTool.handler({ path: `${testCase.id}.json` });
  }
  await exploreTool.handler({ environment: 'staging' });

  const spokeInput = await generationSpokeInputTool.handler({ testCaseId: 'pack-login', elementIds: [] });
  const outcome = await generationVerifyTool.handler({
    input: spokeInput,
    content: SPEC,
    filePath: 'tests/qa/generated/pack-login.spec.ts',
    generatorVersion: spokeInput.locatorModule?.generatorVersion ?? 'unknown',
  });
  if (outcome.status !== 'verified' || outcome.spec === undefined) {
    throw new Error(`The spec was not verified: ${outcome.status}`);
  }
  await generationRegisterTool.handler({ spec: outcome.spec, verificationId: outcome.verificationId });

  // A case whose recorded history flips back and forth.
  const history: [string, 'passed' | 'failed'][] = [
    ['h1', 'passed'],
    ['h2', 'failed'],
    ['h3', 'passed'],
  ];
  for (const [index, [id, status]] of history.entries()) {
    await writeFile(
      join(PROJECT_ROOT, '.qa', 'runs', 'history', 'results', `${id}.json`),
      historicalResult(id, status, index),
      'utf-8',
    );
  }
}, STARTUP_TIMEOUT_MS * 3);

afterAll(async () => {
  await demoApp.stop();
  process.chdir(originalCwd);
  await rm(PROJECT_ROOT, { recursive: true, force: true });
});

// A regression pack on the real demo app (P4-09): the engine plans it from registered cases, the
// verification it holds and the run history, and the spec route really runs. The live route is the
// agent's `qa-execute`; what is checked for it here is that exactly the cases with no spec go there.
describe('regression pack (demo app, no LLM)', () => {
  it(
    'routes each case of the pack to the right path, says why the others are out, and runs the spec route',
    async () => {
      const plan = await regressionPlanTool.handler({ maxTier: 'critical-path' });

      expect(plan.included.map((entry) => [entry.testCaseId, entry.route, entry.routeReason])).toEqual([
        ['pack-greeting', 'live', 'no-verified-spec'],
        ['pack-login', 'spec', 'verified-spec'],
      ]);
      expect(Object.fromEntries(plan.excluded.map((entry) => [entry.testCaseId, entry.reason]))).toEqual({
        'pack-deep': 'tier-above-threshold',
        'pack-flip': 'flaky',
      });
      expect(plan.specRuns).toEqual([
        { testType: 'e2e', specFiles: ['tests/qa/generated/pack-login.spec.ts'] },
      ]);

      const run = await runTool.handler({ specFiles: plan.specRuns[0]?.specFiles ?? [] });

      expect(run.counts).toMatchObject({ passed: 1, failed: 0 });
      const wider = await regressionPlanTool.handler({ maxTier: 'extended' });
      expect(wider.included.map((entry) => entry.testCaseId)).toEqual([
        'pack-greeting',
        'pack-login',
        'pack-deep',
      ]);
    },
    STARTUP_TIMEOUT_MS * 2,
  );
});
