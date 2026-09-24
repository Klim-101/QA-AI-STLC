// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RunResult, SelectorRegistry } from '@qa-ai-stlc/schemas';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSessionStore } from '../src/browser-session-store.js';
import { runBrowserAccessibilityScan } from '../src/operations/browser-accessibility-scan.js';
import { runBrowserClick } from '../src/operations/browser-click.js';
import type { BrowserOperationContext } from '../src/operations/browser-context.js';
import { runBrowserFill } from '../src/operations/browser-fill.js';
import { runBrowserNavigate } from '../src/operations/browser-navigate.js';
import { runBrowserOpen } from '../src/operations/browser-open.js';
import { runRegisterCaseResult } from '../src/operations/case-result-register.js';
import { runHttpExecute } from '../src/operations/http-execute.js';
import { runRegisterExecutedElement } from '../src/operations/registry-execute-register.js';
import { fetchHttpClient } from '../src/ports/http-client.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { playwrightBrowserLauncher } from '../src/ports/browser-launcher.js';
import { systemClock } from '../src/ports/clock.js';
import { noopLogger } from '../src/ports/logger.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';
import type { EngineContext } from '../src/engine-context.js';

// A fixed port, not 0: the demo app logs the port it was told to bind to, not the one the OS
// actually assigned, so port 0 would leave this test unable to find the real address. Distinct
// from the ports packages/explorer's and packages/cli's own demo-app tests use.
const PORT = 4394;
const BASE_URL = `http://localhost:${String(PORT)}/`;
const STARTUP_TIMEOUT_MS = 60_000;

let demoApp: ChildProcess;

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Demo app did not become reachable at ${url} within ${String(timeoutMs)}ms`);
}

beforeAll(async () => {
  const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath === undefined) {
    throw new Error('This test must run through an npm script (npm_execpath is unset).');
  }
  demoApp = spawn(process.execPath, [npmExecPath, 'run', 'start', '--workspace', '@qa-ai-stlc/demo-app'], {
    cwd: repoRoot,
    env: { ...process.env, DEMO_APP_PORT: String(PORT) },
    stdio: 'ignore',
  });
  await waitForServer(`${BASE_URL}login`, STARTUP_TIMEOUT_MS);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(() => {
  demoApp.kill();
});

const CONFIG_YAML = [
  'schemaVersion: 1',
  // The new P3-14 operations do not check testing.<type> scope themselves (unlike qa cases add),
  // so a minimal e2e-only config is enough here.
  'testing: { e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
  'environments:',
  `  staging: { baseUrl: "${BASE_URL}", allowlist: ["localhost"] }`,
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

async function readQaFile(projectRoot: string, relativePath: string): Promise<unknown> {
  const raw = await readFile(join(projectRoot, '.qa', ...relativePath.split('/')), 'utf-8');
  return JSON.parse(raw) as unknown;
}

// Exercises interactive case execution (P3-14) against a real browser and a real running
// application (AGENTS.md section 13), the boundary the fake BrowserLauncher/HttpClient in every
// other test file for these operations cannot cover: a real form POST going through under
// executionMode (ADR-0009), a real axe-core scan, and a real HTTP call.
describe('interactive case execution (demo app)', () => {
  it('proves a real login case works end to end, across all three test types', async () => {
    await withTempDir(async (projectRoot) => {
      await mkdir(join(projectRoot, '.qa'), { recursive: true });
      await writeFile(join(projectRoot, '.qa', 'config.yaml'), CONFIG_YAML, 'utf-8');

      const engine: EngineContext = {
        projectRoot,
        fs: nodeFileSystem,
        clock: systemClock,
        logger: noopLogger,
        processRunner: nodeProcessRunner,
        httpClient: fetchHttpClient,
        browserLauncher: playwrightBrowserLauncher,
        env: process.env,
      };
      const sessions = new BrowserSessionStore();
      const context: BrowserOperationContext = { engine, sessions };
      const startedAt = systemClock.now().toISOString();

      // 1. Web: a real form POST, only possible because executionMode relaxes the GET-only rule.
      const { sessionId, runId } = await runBrowserOpen(context, {
        environment: 'staging',
        executionMode: true,
      });
      await runBrowserNavigate(context, { sessionId, url: `${BASE_URL}login` });
      await runBrowserFill(context, { sessionId, selector: '#email', value: 'admin@example.com' });
      await runBrowserFill(context, { sessionId, selector: 'input[name="password"]', value: 'admin123' });
      const loginButtonSelector = 'role=button[name="Log in"]';

      // 2. Promote the ad hoc login-button selector into the registry (it had no prior entry),
      // before clicking it — the click submits the form and navigates to /dashboard, where the
      // login button no longer exists to re-verify against.
      const registration = await runRegisterExecutedElement(context, {
        sessionId,
        selector: loginButtonSelector,
        kind: 'button',
        name: 'Log in',
      });
      expect(registration.created).toBe(true);
      const registry = (await readQaFile(projectRoot, 'selectors/registry.json')) as SelectorRegistry;
      expect(registry.elements).toEqual([
        expect.objectContaining({ elementId: registration.elementId, source: 'execute', kind: 'button' }),
      ]);

      const click = await runBrowserClick(context, { sessionId, selector: loginButtonSelector });
      expect(click.url).toBe(`${BASE_URL}dashboard`);

      // 3. Accessibility: a real axe-core scan of the authenticated dashboard.
      const scan = await runBrowserAccessibilityScan(context, { sessionId });
      expect(scan.violationCount).toBeGreaterThanOrEqual(0);
      const scanEvidence = (await readQaFile(projectRoot, scan.evidence.path)) as { violations: unknown[] };
      expect(Array.isArray(scanEvidence.violations)).toBe(true);

      // 4. API: a direct HTTP call, no browser involved.
      const httpResult = await runHttpExecute(engine, { runId, url: `${BASE_URL}login` });
      expect(httpResult.status).toBe(200);

      await sessions.close(sessionId);

      // 5. Tie every piece of evidence together under one run result.
      const result = await runRegisterCaseResult(engine, {
        testCaseId: 'login-valid-credentials',
        testType: 'e2e',
        runId,
        status: 'passed',
        startedAt,
        evidenceIds: [click.evidence.id, scan.evidence.id, httpResult.evidence.id],
      });
      const runResult = (await readQaFile(projectRoot, result.runResultPath)) as RunResult;
      expect(runResult.status).toBe('passed');
      expect(runResult.testCaseId).toBe('login-valid-credentials');
    });
  }, 60_000);
});
