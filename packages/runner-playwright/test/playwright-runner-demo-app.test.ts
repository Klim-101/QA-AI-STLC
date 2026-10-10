// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

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
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { playwrightRunner } from '../src/playwright-runner.js';

// A fixed port, not 0: the demo app logs the port it was told to bind to, not the one the OS
// actually assigned. Distinct from the ports every other package's own demo-app test uses.
const PORT = 4395;
const BASE_URL = `http://localhost:${String(PORT)}/`;
const STARTUP_TIMEOUT_MS = 60_000;

let demoApp: ManagedServer;

beforeAll(async () => {
  demoApp = await startDemoApp(PORT);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(async () => {
  await demoApp.stop();
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
        testIdAttribute: 'data-testid',
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

  // P3-20: a generated spec's own empty body (`user can log in` has no `test.step()` calls or
  // `stepIds` annotation at all) must not pass verification just because it happens to hit
  // `passed` in Playwright's eyes. Against a real Playwright run, `requiredStepIds` (the canonical
  // set `verifyGeneratedTestSpec` derives from the actual `TestCase`, never the spec's own claim)
  // forces the honest "nothing was actually exercised" result instead.
  it(
    'reports "partial" against the canonical required step ids, even for a test with no "stepIds" annotation of its own',
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
        runId: 'run-demo-app-login-required',
        baseUrl: BASE_URL,
        specFiles: [specFile],
        requiredStepIds: ['step-1', 'expected-result'],
      });

      const emptyBody = outcomes.find((outcome) => outcome.result.testCaseId === 'demo-app-login');
      expect(emptyBody?.result.status).toBe('partial');
      expect(emptyBody?.result.missingStepIds).toEqual(['step-1', 'expected-result']);
    },
    STARTUP_TIMEOUT_MS,
  );

  // F3 (#605): the title of a `test.step()` is written by whoever wrote the spec. Against the real
  // Playwright process, what a step owes is judged by the actions and assertions it contains.
  it(
    'holds each required step to real work, and the expected result to a real check',
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
      const specFile = fileURLToPath(new URL('./fixtures/step-work.playwright-spec.ts', import.meta.url));

      const outcomes = await playwrightRunner.run(engine, {
        runId: 'run-step-work',
        baseUrl: BASE_URL,
        specFiles: [specFile],
        requiredStepIds: ['step-1', 'expected-result'],
      });

      const byCase = (id: string) => outcomes.find((outcome) => outcome.result.testCaseId === id)?.result;
      expect(byCase('empty-steps')).toMatchObject({
        status: 'partial',
        missingStepIds: ['step-1', 'expected-result'],
      });
      expect(byCase('real-work')?.status).toBe('passed');
      expect(byCase('tautology')).toMatchObject({ status: 'partial', missingStepIds: ['expected-result'] });
      expect(byCase('violation')?.status).toBe('failed');
    },
    STARTUP_TIMEOUT_MS,
  );
});
