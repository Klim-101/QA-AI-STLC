// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  fetchHttpClient,
  nodeFileSystem,
  nodeProcessRunner,
  noopLogger,
  playwrightBrowserLauncher,
  systemClock,
  type EngineContext,
} from '@qa-ai-stlc/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { playwrightRunner } from '../src/playwright-runner.js';

// A fixed port, not 0: the demo app logs the port it was told to bind to, not the one the OS
// actually assigned. Distinct from the ports every other package's own demo-app test uses.
const PORT = 4395;
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

// Exercises the real Playwright Test runner and its real JSON report (AGENTS.md section 13), the
// boundary a unit test with a hand-built report fixture cannot cover: an actual browser, an actual
// spawned `playwright test` process, and the report format that process actually writes.
describe('playwrightRunner (demo app)', () => {
  it(
    'runs a hand-written spec and yields validated run results',
    async () => {
      const engine: EngineContext = {
        projectRoot: fileURLToPath(new URL('../', import.meta.url)),
        fs: nodeFileSystem,
        clock: systemClock,
        logger: noopLogger,
        processRunner: nodeProcessRunner,
        httpClient: fetchHttpClient,
        browserLauncher: playwrightBrowserLauncher,
        env: process.env,
      };
      const specFile = fileURLToPath(
        new URL('./fixtures/demo-app-login.playwright-spec.ts', import.meta.url),
      );

      const outcomes = await playwrightRunner.run(engine, {
        runId: 'run-demo-app-login',
        baseUrl: BASE_URL,
        specFiles: [specFile],
      });

      expect(outcomes).toHaveLength(3);
      const passed = outcomes.find((outcome) => outcome.result.testCaseId === 'demo-app-login');
      const failed = outcomes.find(
        (outcome) => outcome.result.testCaseId === 'demo-app-login-wrong-password',
      );
      const partial = outcomes.find(
        (outcome) => outcome.result.testCaseId === 'demo-app-login-wrong-password-steps',
      );

      expect(passed?.result).toMatchObject({
        runId: 'run-demo-app-login',
        testType: 'e2e',
        status: 'passed',
      });
      expect(passed?.result.failure).toBeUndefined();
      // A passing test needs nothing to back it up (`spec-config.ts`'s "only on failure" capture).
      expect(passed?.evidence).toEqual([]);

      expect(failed?.result).toMatchObject({
        runId: 'run-demo-app-login',
        testType: 'e2e',
        status: 'failed',
      });
      expect(failed?.result.failure?.message.length).toBeGreaterThan(0);
      // The real Playwright Test runner, with real screenshot/trace capture enabled (P3-03):
      // proves this runner reads back real attachment files, not just a hand-built report fixture.
      expect(failed?.evidence.map((item) => item.kind).sort()).toEqual(['screenshot', 'trace']);

      expect(partial?.result).toMatchObject({
        runId: 'run-demo-app-login',
        testType: 'e2e',
        status: 'partial',
      });
      expect(partial?.result.missingStepIds).toEqual(['expected-result']);
      expect(partial?.result.failure?.message.length).toBeGreaterThan(0);
      expect(partial?.evidence.map((item) => item.kind).sort()).toEqual(['screenshot', 'trace']);
    },
    STARTUP_TIMEOUT_MS,
  );
});
