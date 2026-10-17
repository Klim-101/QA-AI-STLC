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
import { reviewAddTool } from '../src/tools/review-add.js';
import { reviewInputTool } from '../src/tools/review-input.js';
import { scopeTool } from '../src/tools/scope.js';

// Own port: test files run in parallel (AGENTS.md 13).
const PORT = 4698;
const BASE_URL = `http://localhost:${String(PORT)}/`;
const STARTUP_TIMEOUT_MS = 60_000;

let demoApp: ManagedServer;

// A scratch project inside the checkout so a generated spec resolves `@playwright/test`.
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PROJECT_ROOT = join(REPO_ROOT, '.review-demo-app-scratch');

const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
  'environments:',
  `  staging: { baseUrl: "${BASE_URL}login", allowlist: ["localhost"] }`,
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

const CASES = [
  { id: 'login-honest', title: 'A registered user can log in' },
  { id: 'login-padded', title: 'A registered user can log in, again' },
] as const;

function spec(testCaseId: string, title: string, extraAssertions: readonly string[]): string {
  return [
    "import { expect, test } from '@playwright/test';",
    '',
    `test('${title}', {`,
    '  annotation: [',
    `    { type: 'testCaseId', description: '${testCaseId}' },`,
    "    { type: 'stepIds', description: 'step-1,expected-result' },",
    '  ],',
    '}, async ({ page }) => {',
    "  await test.step('[step-1] Submit valid credentials', async () => {",
    "    await page.goto('/login');",
    "    await page.fill('#email', 'admin@example.com');",
    "    await page.fill('input[name=\"password\"]', 'admin123');",
    "    await page.getByRole('button', { name: 'Log in' }).click();",
    '  });',
    "  await test.step('[expected-result] The dashboard loads', async () => {",
    '    await expect(page).toHaveURL(/\\/dashboard/);',
    ...extraAssertions.map((line) => `    ${line}`),
    '  });',
    '});',
    '',
  ].join('\n');
}

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
  for (const testCase of CASES) {
    await writeFile(
      join(PROJECT_ROOT, `${testCase.id}.json`),
      JSON.stringify({
        id: testCase.id,
        feature: testCase.id,
        requirementIds: ['login'],
        testType: 'e2e',
        title: testCase.title,
        steps: [{ description: 'Submit valid credentials' }],
        expectedResult: 'The dashboard loads',
        status: 'approved',
        createdAt: '2026-10-17T09:00:00Z',
      }),
      'utf-8',
    );
    await casesAddTool.handler({ path: `${testCase.id}.json` });
  }
  await exploreTool.handler({ environment: 'staging' });
}, STARTUP_TIMEOUT_MS + 15_000);

afterAll(async () => {
  await demoApp.stop();
  process.chdir(originalCwd);
  await rm(PROJECT_ROOT, { recursive: true, force: true });
});

async function registerSpec(testCaseId: string, filePath: string, content: string): Promise<void> {
  const spokeInput = await generationSpokeInputTool.handler({ testCaseId, elementIds: [] });
  const outcome = await generationVerifyTool.handler({
    input: spokeInput,
    content,
    filePath,
    generatorVersion: spokeInput.locatorModule?.generatorVersion ?? 'unknown',
  });
  if (outcome.status !== 'verified' || outcome.spec === undefined) {
    throw new Error(`${testCaseId} was not verified: ${outcome.status}`);
  }
  await generationRegisterTool.handler({ spec: outcome.spec, verificationId: outcome.verificationId });
}

// The reviewer's engine side against real specs that Playwright really ran, with no model. The
// padded spec is verified and registered like any other: the run passes, since `expect(true)` always
// does. What the review adds is what a run cannot see (P4-06).
describe('independent review (demo app, no LLM)', () => {
  it(
    'rejects a spec with a fabricated assertion that the run passed, and approves an honest one',
    async () => {
      const honestPath = 'tests/qa/generated/login-honest.spec.ts';
      const paddedPath = 'tests/qa/generated/login-padded.spec.ts';
      await registerSpec(
        'login-honest',
        honestPath,
        spec('login-honest', 'a registered user can log in', []),
      );
      await registerSpec(
        'login-padded',
        paddedPath,
        spec('login-padded', 'a registered user can log in, again', ['expect(true).toBe(true);']),
      );

      const padded = await reviewInputTool.handler({ testCaseId: 'login-padded', specPath: paddedPath });
      const honest = await reviewInputTool.handler({ testCaseId: 'login-honest', specPath: honestPath });

      expect(padded.verification).toMatchObject({ status: 'verified', resultStatus: 'passed' });
      expect(
        padded.assertions.flatMap((assertion) => assertion.findings.map((finding) => finding.code)),
      ).toEqual(['tautology']);
      expect(honest.assertions.flatMap((assertion) => assertion.findings)).toEqual([]);

      const base = { schemaVersion: 1 as const, createdAt: '2026-10-17T09:00:00Z', waivers: [] };
      const approvalOfPadded = await reviewAddTool
        .handler({
          review: {
            ...base,
            testCaseId: 'login-padded',
            specPath: paddedPath,
            specSha256: padded.specSha256,
            verdict: 'approved',
            reasons: ['The run passed.'],
          },
        })
        .catch((caught: unknown) => caught);
      const rejectionOfPadded = await reviewAddTool.handler({
        review: {
          ...base,
          testCaseId: 'login-padded',
          specPath: paddedPath,
          specSha256: padded.specSha256,
          verdict: 'rejected',
          reasons: ['a2 asserts a literal: it holds whatever the application does.'],
        },
      });
      const approvalOfHonest = await reviewAddTool.handler({
        review: {
          ...base,
          testCaseId: 'login-honest',
          specPath: honestPath,
          specSha256: honest.specSha256,
          verdict: 'approved',
          reasons: ['It checks the URL the case names.'],
        },
      });

      expect(approvalOfPadded).toMatchObject({ code: 'REVIEW_APPROVAL_BLOCKED' });
      expect(rejectionOfPadded).toMatchObject({
        verdict: 'rejected',
        reviewPath: 'artifacts/reviews/login-padded.json',
      });
      expect(approvalOfHonest).toMatchObject({ verdict: 'approved' });
    },
    STARTUP_TIMEOUT_MS * 2,
  );
});
