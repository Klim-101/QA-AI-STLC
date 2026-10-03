// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSessionStore } from '../src/browser-session-store.js';
import type { EngineContext } from '../src/engine-context.js';
import type { BrowserOperationContext } from '../src/operations/browser-context.js';
import { runBrowserConsole } from '../src/operations/browser-console.js';
import { runBrowserNavigate } from '../src/operations/browser-navigate.js';
import { runBrowserNetwork } from '../src/operations/browser-network.js';
import { runBrowserOpen } from '../src/operations/browser-open.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { playwrightBrowserLauncher } from '../src/ports/browser-launcher.js';
import { systemClock } from '../src/ports/clock.js';
import { fetchHttpClient } from '../src/ports/http-client.js';
import { noopLogger } from '../src/ports/logger.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';

const PORT = 4417;
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
  'testing: { e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
  'environments:',
  `  staging: { baseUrl: "${BASE_URL}", allowlist: ["localhost"], actionTimeoutMs: 5000 }`,
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

async function withContext(
  run: (context: BrowserOperationContext, sessionId: string) => Promise<void>,
): Promise<void> {
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
    try {
      const { sessionId } = await runBrowserOpen(context, { environment: 'staging' });
      await runBrowserNavigate(context, { sessionId, url: `${BASE_URL}login` });
      await run(context, sessionId);
    } finally {
      await Promise.all(sessions.sessionIds.map((sessionId) => sessions.close(sessionId)));
    }
  });
}

interface LoggingPage {
  console: { error(message: string): void; log(message: string): void };
  setTimeout(callback: () => void, milliseconds: number): void;
  fetch(url: string): Promise<unknown>;
}

interface Calls {
  readonly missing: string;
  readonly blocked: string;
}

// Runs inside the page, where nothing from this module exists. The requests carry a token in the
// query, which must never reach a result or the evidence.
async function misbehave(calls: Calls): Promise<void> {
  const page = globalThis as unknown as LoggingPage;
  page.console.log('starting up');
  page.console.error('save failed with Bearer abcdefghijklmnopqrstuvwxyz0123');
  page.setTimeout(() => {
    throw new Error('uncaught in a timer');
  }, 0);
  await page.fetch(calls.missing);
  await page.fetch(calls.blocked).catch(() => undefined);
}

const CALLS: Calls = {
  missing: `${BASE_URL}api/orders/1234567/missing?token=sekrit-value-123456`,
  // The same server under a host the environment does not allow, so safe mode aborts it.
  blocked: `http://127.0.0.1:${String(PORT)}/api/other?token=sekrit-value-123456`,
};

describe('qa.browser_console and qa.browser_network on the demo app', () => {
  it('reads a console error and an uncaught exception, redacted and capped', async () => {
    await withContext(async (context, sessionId) => {
      const session = await context.sessions.get(sessionId);
      await session.page.evaluate(misbehave, CALLS);
      await new Promise((resolve) => setTimeout(resolve, 300));

      const result = await runBrowserConsole(context, { sessionId, errorsOnly: true, limit: 10 });

      const texts = result.entries.map((entry) => `${entry.level}: ${entry.text}`);
      expect(texts).toContain('error: save failed with [REDACTED]');
      expect(texts).toContain('pageerror: uncaught in a timer');
      expect(JSON.stringify(result)).not.toContain('abcdefghijklmnopqrstuvwxyz0123');
      const log = JSON.parse(
        await readFile(join(context.engine.projectRoot, '.qa', result.evidence.path), 'utf-8'),
      ) as { entries: { text: string }[] };
      expect(log.entries.map((entry) => entry.text)).toContain('starting up');
      expect(JSON.stringify(log)).not.toContain('abcdefghijklmnopqrstuvwxyz0123');
    });
  }, 30_000);

  it('reads a failed request and an error status without any value from the request', async () => {
    await withContext(async (context, sessionId) => {
      const session = await context.sessions.get(sessionId);
      await session.page.evaluate(misbehave, CALLS);

      const result = await runBrowserNetwork(context, { sessionId, errorsOnly: true });

      expect(result.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: 'GET',
            status: 404,
            url: `${BASE_URL}api/orders/:id/missing?token`,
          }) as unknown,
          expect.objectContaining({
            method: 'GET',
            failure: expect.any(String) as unknown,
            url: expect.stringContaining('127.0.0.1') as unknown,
          }) as unknown,
        ]),
      );
      const evidence = await readFile(join(context.engine.projectRoot, '.qa', result.evidence.path), 'utf-8');
      expect(JSON.stringify(result) + evidence).not.toContain('sekrit-value');
      expect(JSON.parse(evidence)).toMatchObject({ log: 'network' });
    });
  }, 30_000);

  it('returns only what happened after the cursor', async () => {
    await withContext(async (context, sessionId) => {
      const session = await context.sessions.get(sessionId);
      const before = await runBrowserNetwork(context, { sessionId });

      await session.page.evaluate(misbehave, CALLS);
      const after = await runBrowserNetwork(context, { sessionId, since: before.cursor });

      expect(after.entries.length).toBeGreaterThan(0);
      expect(after.entries.every((entry) => entry.seq > before.cursor)).toBe(true);
    });
  }, 30_000);
});
