// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runTool } from '../src/tools/run.js';
import { specCheckTool } from '../src/tools/spec-check.js';

// Own port: test files run in parallel (AGENTS.md 13).
const PORT = 4699;
const BASE_URL = `http://localhost:${String(PORT)}/`;
const STARTUP_TIMEOUT_MS = 60_000;

let demoApp: ManagedServer;

// A scratch project inside the checkout so the spec resolves `@playwright/test`.
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PROJECT_ROOT = join(REPO_ROOT, '.spec-check-demo-app-scratch');

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

const SPEC = [
  "import { expect, test } from '@playwright/test';",
  '',
  "test('the login page loads', { annotation: { type: 'testCaseId', description: 'login-page' } }, async ({ page }) => {",
  "  await page.goto('/login');",
  "  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();",
  '});',
  '',
  "test('the login page offers a button that is not there', { annotation: { type: 'testCaseId', description: 'ghost-button' } }, async ({ page }) => {",
  "  await page.goto('/login');",
  "  await expect(page.getByRole('button', { name: 'Sign up now' })).toBeVisible({ timeout: 2000 });",
  '});',
  '',
].join('\n');

let originalCwd: string;

async function filesUnder(directory: string): Promise<readonly string[]> {
  return (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

beforeAll(async () => {
  demoApp = await startDemoApp(PORT);
  originalCwd = process.cwd();
  await rm(PROJECT_ROOT, { recursive: true, force: true });
  await mkdir(join(PROJECT_ROOT, 'tests'), { recursive: true });
  await mkdir(join(PROJECT_ROOT, '.qa'), { recursive: true });
  await writeFile(join(PROJECT_ROOT, '.qa', 'config.yaml'), CONFIG_YAML, 'utf-8');
  await writeFile(join(PROJECT_ROOT, 'tests', 'check.spec.ts'), SPEC, 'utf-8');
  process.chdir(PROJECT_ROOT);
}, STARTUP_TIMEOUT_MS);

afterAll(async () => {
  await demoApp.stop();
  process.chdir(originalCwd);
  await rm(PROJECT_ROOT, { recursive: true, force: true });
});

// A real run of a real spec on the real demo app: the check reports what each test did and leaves
// `.qa/` exactly as it found it, where `qa.run` of the same spec adds a run (P4-18).
describe('spec check (demo app, no LLM)', () => {
  it(
    'reports a passing and a failing test and records nothing, unlike qa.run',
    async () => {
      const before = await filesUnder(join(PROJECT_ROOT, '.qa'));

      const checked = await specCheckTool.handler({ specFiles: ['tests/check.spec.ts'] });
      const afterCheck = await filesUnder(join(PROJECT_ROOT, '.qa'));

      expect(checked.counts).toMatchObject({ passed: 1, failed: 1 });
      const byCase = Object.fromEntries(checked.results.map((result) => [result.testCaseId, result]));
      expect(byCase['login-page']).toEqual({ testCaseId: 'login-page', status: 'passed' });
      expect(byCase['ghost-button']?.status).toBe('failed');
      expect(byCase['ghost-button']?.failureMessage).toContain('UNTRUSTED EVIDENCE BEGIN');
      expect(afterCheck).toEqual(before);

      await runTool.handler({ specFiles: ['tests/check.spec.ts'] });

      expect((await filesUnder(join(PROJECT_ROOT, '.qa'))).length).toBeGreaterThan(before.length);
    },
    STARTUP_TIMEOUT_MS * 2,
  );
});
