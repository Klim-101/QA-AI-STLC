// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import type { TriageCategory } from '@qa-ai-stlc/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runTool } from '../src/tools/run.js';
import { triageAddTool } from '../src/tools/triage-add.js';
import { triageInputTool } from '../src/tools/triage-input.js';

// Own port: test files run in parallel (AGENTS.md 13).
const PORT = 4695;
const BASE_URL = `http://localhost:${String(PORT)}/`;
const STARTUP_TIMEOUT_MS = 60_000;

let demoApp: ManagedServer;

// A scratch project inside the checkout so the spec resolves `@playwright/test`.
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PROJECT_ROOT = join(REPO_ROOT, '.triage-demo-app-scratch');

const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
  'environments:',
  `  staging: { baseUrl: "${BASE_URL}", allowlist: ["localhost"] }`,
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

// Three cases that fail for the three reasons a triage has to tell apart, against the real demo app.
const SPEC = [
  "import { expect, test } from '@playwright/test';",
  '',
  "async function logIn(page: import('@playwright/test').Page): Promise<void> {",
  "  await page.goto('/login');",
  "  await page.fill('#email', 'admin@example.com');",
  "  await page.fill('input[name=\"password\"]', 'admin123');",
  '}',
  '',
  '// BUG-007: the dashboard greeting is always empty.',
  "test('greets the user by name', { annotation: { type: 'testCaseId', description: 'greeting' } }, async ({ page }) => {",
  '  await logIn(page);',
  "  await page.getByRole('button', { name: 'Log in' }).click();",
  "  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Welcome, \\w+/);",
  '});',
  '',
  '// The button is called "Log in", not "Sign in": a selector the application moved away from.',
  "test('signs in with the old button name', { annotation: { type: 'testCaseId', description: 'old-button' } }, async ({ page }) => {",
  '  await logIn(page);',
  "  await page.getByRole('button', { name: 'Sign in' }).click({ timeout: 2000 });",
  '});',
  '',
  "test('reaches a service that is down', { annotation: { type: 'testCaseId', description: 'service-down' } }, async ({ page }) => {",
  "  await page.goto('http://localhost:1/');",
  '});',
  '',
].join('\n');

let originalCwd: string;

beforeAll(async () => {
  demoApp = await startDemoApp(PORT);
  originalCwd = process.cwd();
  await rm(PROJECT_ROOT, { recursive: true, force: true });
  await mkdir(join(PROJECT_ROOT, 'tests'), { recursive: true });
  await mkdir(join(PROJECT_ROOT, '.qa'), { recursive: true });
  await writeFile(join(PROJECT_ROOT, '.qa', 'config.yaml'), CONFIG_YAML, 'utf-8');
  await writeFile(join(PROJECT_ROOT, 'tests', 'triage.spec.ts'), SPEC, 'utf-8');
  process.chdir(PROJECT_ROOT);
}, STARTUP_TIMEOUT_MS);

afterAll(async () => {
  await demoApp.stop();
  process.chdir(originalCwd);
  await rm(PROJECT_ROOT, { recursive: true, force: true });
});

// The triage spoke's engine side against a real run of a real application, with no model: the
// classification below is what the spoke would return for these failures, and what is under test is
// that the engine hands it what it needs and accepts a faithful answer (P4-05).
describe('failure triage (demo app, no LLM)', () => {
  it(
    'gives the spoke each failure with the hint that matches why it failed, and registers its classification',
    async () => {
      const run = await runTool.handler({ specFiles: ['tests/triage.spec.ts'] });
      expect(run.counts.failed).toBe(3);

      const input = await triageInputTool.handler({ runId: run.runId });

      const kindByCase = Object.fromEntries(
        input.failures.map((failure) => [failure.testCaseId, failure.failureKind]),
      );
      expect(kindByCase).toEqual({
        greeting: 'assertion-mismatch',
        'old-button': 'locator-not-found',
        'service-down': 'network',
      });
      expect(input.failures.every((failure) => !failure.isFlaky)).toBe(true);
      expect(input.failures.every((failure) => failure.failureMessage.includes('UNTRUSTED EVIDENCE'))).toBe(
        true,
      );

      const category: Record<string, TriageCategory> = {
        greeting: 'product-bug',
        'old-button': 'stale-selector',
        'service-down': 'environment',
      };
      const added = await triageAddTool.handler({
        triage: {
          schemaVersion: 1,
          runId: run.runId,
          entries: input.failures.map((failure) => ({
            resultId: failure.resultId,
            testCaseId: failure.testCaseId,
            category: category[failure.testCaseId] ?? 'uncertain',
            confidence: 'medium',
            reasons: [`The failure reads as ${failure.failureKind}.`],
            evidencePaths: failure.evidence.map((evidence) => evidence.path),
          })),
          createdAt: '2026-10-17T09:00:00Z',
        },
      });

      expect(added).toEqual({
        runId: run.runId,
        triagePath: `artifacts/triage/${run.runId}.json`,
        entryCount: 3,
      });
      const stored = JSON.parse(await readFile(join(PROJECT_ROOT, '.qa', added.triagePath), 'utf-8')) as {
        entries: { testCaseId: string; category: string }[];
      };
      expect(Object.fromEntries(stored.entries.map((entry) => [entry.testCaseId, entry.category]))).toEqual(
        category,
      );

      const flaky = await triageAddTool
        .handler({
          triage: {
            schemaVersion: 1,
            runId: run.runId,
            entries: input.failures.map((failure) => ({
              resultId: failure.resultId,
              testCaseId: failure.testCaseId,
              category: 'flaky',
              confidence: 'low',
              reasons: ['It failed once.'],
              evidencePaths: [],
            })),
            createdAt: '2026-10-17T09:00:00Z',
          },
        })
        .catch((caught: unknown) => caught);
      expect(flaky).toMatchObject({ code: 'TRIAGE_FLAKY_WITHOUT_HISTORY' });
    },
    STARTUP_TIMEOUT_MS * 2,
  );
});
