// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// The scripted baseline of the agent-layer eval set (P4-07): what the engine yields for the demo
// app when the spokes' work is done by fixed code instead of a model. It makes the same engine calls
// a hub and its spokes make (spoke records, exploration, case registration, a run, a triage), so a
// run by a real agent in a host can be scored by the same scorer and compared with it. There is no
// model here: the "designed" cases, the specs and the classification below are deterministic.
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BUILTIN_TOOLS } from '@qa-ai-stlc/mcp-server';

const RUN_ID = 'eval-baseline';
// `agents.parallelism` of the baseline project unless a run names another: the hub dispatches no
// more spokes than this at once. 1 is sequential mode.
export const DEFAULT_PARALLELISM = 4;

function tool(name) {
  const found = BUILTIN_TOOLS.find((candidate) => candidate.name === name);
  if (found === undefined) {
    throw new Error(`The engine has no tool "${name}".`);
  }
  return found;
}

export function configYaml(baseUrl, parallelism = DEFAULT_PARALLELISM) {
  return [
    'schemaVersion: 1',
    'testing: { e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
    'environments:',
    `  staging: { baseUrl: "${baseUrl}", allowlist: ["localhost"] }`,
    'identities: {}',
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
    `agents: { parallelism: ${String(parallelism)}, spokeTimeoutSeconds: 120, retries: 1 }`,
    '',
  ].join('\n');
}

// One case per catalogued bug the baseline targets, plus one that must pass. BUG-008 (sorting) has
// no case: the baseline does not cover every bug, so the detection rate it scores is not 100%.
export const BASELINE_CASES = [
  { id: 'login-works', feature: 'login', title: 'A registered user can log in', step: 'Log in as the admin' },
  {
    id: 'task-empty-title',
    feature: 'tasks-create',
    title: 'A task needs a title',
    step: 'Post a task with no title',
  },
  {
    id: 'task-status-filter',
    feature: 'tasks-filter',
    title: 'The status filter filters',
    step: 'Filter the task list by status',
  },
  { id: 'task-delete', feature: 'tasks-delete', title: 'A deleted task is gone', step: 'Delete a task' },
  {
    id: 'dashboard-greeting',
    feature: 'dashboard',
    title: 'The dashboard greets the user by name',
    step: 'Open the dashboard',
  },
];

const SPEC = [
  "import { expect, test } from '@playwright/test';",
  '',
  'async function logIn(page: import("@playwright/test").Page): Promise<void> {',
  "  await page.goto('/login');",
  "  await page.fill('#email', 'admin@example.com');",
  "  await page.fill('input[name=\"password\"]', 'admin123');",
  "  await page.getByRole('button', { name: 'Log in' }).click();",
  '}',
  '',
  "test('login works', { annotation: { type: 'testCaseId', description: 'login-works' } }, async ({ page }) => {",
  '  await logIn(page);',
  '  await expect(page).toHaveURL(/\\/dashboard/);',
  '});',
  '',
  "test('a task needs a title', { annotation: { type: 'testCaseId', description: 'task-empty-title' } }, async ({ page }) => {",
  '  await logIn(page);',
  "  const response = await page.request.post('/tasks', { form: { title: '' }, maxRedirects: 0 });",
  '  expect(response.status()).toBe(400);',
  '});',
  '',
  "test('the status filter filters', { annotation: { type: 'testCaseId', description: 'task-status-filter' } }, async ({ page }) => {",
  '  await logIn(page);',
  "  await page.goto('/tasks');",
  "  await page.selectOption('#status', 'done');",
  "  await page.getByTestId('apply-filter').click();",
  "  await expect(page.locator('tbody tr', { hasNotText: 'done' })).toHaveCount(0);",
  '});',
  '',
  "test('a deleted task is gone', { annotation: { type: 'testCaseId', description: 'task-delete' } }, async ({ page }) => {",
  '  await logIn(page);',
  "  await page.request.post('/tasks/t-1/delete', { maxRedirects: 0 });",
  "  const after = await page.request.get('/tasks/t-1');",
  '  expect(after.status()).toBe(404);',
  '});',
  '',
  "test('the dashboard greets the user', { annotation: { type: 'testCaseId', description: 'dashboard-greeting' } }, async ({ page }) => {",
  '  await logIn(page);',
  "  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome, Alex Admin');",
  '});',
  '',
].join('\n');

// What the triage spoke does with a failure's hint when nothing smarter is available: an assertion
// that found the page and saw the wrong thing is a product bug; a hint that cannot tell is not guessed.
export function classifyByHint(failureKind) {
  switch (failureKind) {
    case 'assertion-mismatch':
      return { category: 'product-bug', confidence: 'medium' };
    case 'network':
      return { category: 'environment', confidence: 'medium' };
    default:
      return { category: 'uncertain', confidence: 'low' };
  }
}

async function dispatch(spokeId, taskId, work) {
  const recorded = await tool('qa.spoke_record_input').handler({
    runId: RUN_ID,
    spokeId,
    taskId,
    task: `Do ${taskId}`,
  });
  if (recorded.status !== 'recorded') {
    throw new Error(`${spokeId}/${taskId} was not dispatched: ${recorded.status}`);
  }
  const payload = await work();
  await tool('qa.spoke_record_output').handler({
    runId: RUN_ID,
    attempt: recorded.attempt,
    result: { schemaVersion: 1, spokeId, taskId, status: 'ok', payload },
  });
}

/**
 * Builds a project under `projectRoot` (inside the checkout, so a spec resolves `@playwright/test`),
 * runs the baseline against the demo app at `baseUrl`, and leaves the project for the scorer.
 * Changes the working directory to the project, as the engine tools read it from there.
 */
export async function runBaseline({ projectRoot, baseUrl, parallelism = DEFAULT_PARALLELISM }) {
  await rm(projectRoot, { recursive: true, force: true });
  await mkdir(join(projectRoot, 'tests'), { recursive: true });
  await mkdir(join(projectRoot, '.qa'), { recursive: true });
  await writeFile(join(projectRoot, '.qa', 'config.yaml'), configYaml(baseUrl, parallelism), 'utf-8');
  await writeFile(join(projectRoot, 'tests', 'eval.spec.ts'), SPEC, 'utf-8');
  process.chdir(projectRoot);

  await tool('qa.scope').handler({
    from: 'text',
    label: 'login',
    content: '## Login\nA registered user can log in with valid credentials.\n',
  });

  await dispatch('explorer', 'staging', async () => {
    const explored = await tool('qa.explore').handler({ environment: 'staging' });
    return { registryPath: explored.registryPath, elementCount: explored.elementCount };
  });

  // One test-design spoke per case, as many at once as the configuration allows: the hub's parallel mode.
  for (let first = 0; first < BASELINE_CASES.length; first += parallelism) {
    await Promise.all(
      BASELINE_CASES.slice(first, first + parallelism).map((testCase) =>
        dispatch('test-design', testCase.id, async () => {
          const path = `${testCase.id}.case.json`;
          await writeFile(
            join(projectRoot, path),
            JSON.stringify({
              id: testCase.id,
              feature: testCase.feature,
              requirementIds: ['login'],
              testType: 'e2e',
              title: testCase.title,
              steps: [{ description: testCase.step }],
              expectedResult: testCase.title,
              status: 'approved',
              createdAt: '2026-10-17T09:00:00Z',
            }),
            'utf-8',
          );
          await tool('qa.cases_add').handler({ path });
          return { caseIds: [testCase.id] };
        }),
      ),
    );
  }

  const run = await tool('qa.run').handler({ specFiles: ['tests/eval.spec.ts'] });

  await dispatch('triage', run.runId, async () => {
    const input = await tool('qa.triage_input').handler({ runId: run.runId });
    const added = await tool('qa.triage_add').handler({
      triage: {
        schemaVersion: 1,
        runId: run.runId,
        entries: input.failures.map((failure) => ({
          resultId: failure.resultId,
          testCaseId: failure.testCaseId,
          ...classifyByHint(failure.failureKind),
          reasons: [`The failure reads as ${failure.failureKind}.`],
          evidencePaths: failure.evidence.map((evidence) => evidence.path),
        })),
        createdAt: new Date().toISOString(),
      },
    });
    return { runId: run.runId, triagePath: added.triagePath };
  });

  return { runId: run.runId };
}
