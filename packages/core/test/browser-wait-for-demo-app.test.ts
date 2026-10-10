// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSessionStore } from '../src/browser-session-store.js';
import type { EngineContext } from '../src/engine-context.js';
import type { BrowserOperationContext } from '../src/operations/browser-context.js';
import { runBrowserWaitFor } from '../src/operations/browser-wait-for.js';
import { runBrowserNavigate } from '../src/operations/browser-navigate.js';
import { runBrowserOpen } from '../src/operations/browser-open.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { playwrightBrowserLauncher } from '../src/ports/browser-launcher.js';
import { systemClock } from '../src/ports/clock.js';
import { fetchHttpClient } from '../src/ports/http-client.js';
import { noopLogger } from '../src/ports/logger.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';

const PORT = 4413;
const BASE_URL = `http://localhost:${String(PORT)}/`;
const STARTUP_TIMEOUT_MS = 60_000;

let demoApp: ManagedServer;

beforeAll(async () => {
  demoApp = await startDemoApp(PORT);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(async () => {
  await demoApp.stop();
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

interface PageNode {
  id: string;
  textContent: string | null;
  style: { display: string };
  remove(): void;
  append(node: unknown): void;
}

interface TimedPage {
  document: {
    createElement(tag: string): PageNode;
    querySelector(selector: string): PageNode | null;
  };
  location: { hash: string };
  setTimeout(callback: () => void, milliseconds: number): void;
}

// Runs inside the page, where nothing from this module exists. Everything changes 400 ms after the
// call, so each wait has something real to wait for.
function changeSoon(): void {
  const page = globalThis as unknown as TimedPage;
  const { document } = page;
  const main = document.querySelector('main');
  for (const id of ['going', 'hiding']) {
    const node = document.createElement('p');
    node.id = id;
    node.textContent = id === 'going' ? 'Loading tasks' : 'Spinner';
    main?.append(node);
  }
  page.setTimeout(() => {
    const arrived = document.createElement('p');
    arrived.id = 'late';
    arrived.textContent = 'Arrived';
    main?.append(arrived);
    document.querySelector('#going')?.remove();
    const hiding = document.querySelector('#hiding');
    if (hiding !== null) {
      hiding.style.display = 'none';
    }
    page.location.hash = '#done';
  }, 400);
}

describe('qa.browser_wait_for on the demo app', () => {
  it.each([
    ['visible', { selector: '#late' }],
    ['attached', { selector: '#late' }],
    ['hidden', { selector: '#hiding' }],
    ['detached', { selector: '#going' }],
    ['text-appears', { expected: 'Arrived' }],
    ['text-appears', { selector: '#late', expected: 'Arrived', exact: true }],
    ['text-disappears', { expected: 'Loading tasks' }],
    ['text-disappears', { selector: '#going', expected: 'Loading tasks' }],
    ['url', { expected: '#done' }],
  ] as const)(
    'waits for %s until the page gets there',
    async (condition, extra) => {
      await withContext(async (context, sessionId) => {
        const session = await context.sessions.get(sessionId);
        await session.page.evaluate(changeSoon);

        const result = await runBrowserWaitFor(context, {
          sessionId,
          condition,
          timeoutMs: 5000,
          stepId: 'step-2',
          ...extra,
        });

        expect(result.waitedMs).toBeGreaterThanOrEqual(0);
        const record: unknown = JSON.parse(
          await readFile(join(context.engine.projectRoot, '.qa', result.evidence.path), 'utf-8'),
        );
        expect(record).toMatchObject({ type: 'wait-for', stepId: 'step-2', wait: { condition } });
      });
    },
    30_000,
  );

  it('takes time to wait for what is not there yet', async () => {
    await withContext(async (context, sessionId) => {
      const session = await context.sessions.get(sessionId);
      await session.page.evaluate(changeSoon);

      const result = await runBrowserWaitFor(context, {
        sessionId,
        condition: 'visible',
        selector: '#late',
        timeoutMs: 5000,
      });

      expect(result.waitedMs).toBeGreaterThanOrEqual(200);
    });
  }, 30_000);

  it('fails with a coded error naming the condition when it never holds', async () => {
    await withContext(async (context, sessionId) => {
      const failure = await runBrowserWaitFor(context, {
        sessionId,
        condition: 'text-appears',
        expected: 'Never shown',
        timeoutMs: 300,
      }).catch((caught: unknown) => caught);

      expect(failure).toMatchObject({ code: 'BROWSER_WAIT_TIMEOUT' });
      expect((failure as Error).message).toContain('"text-appears" "Never shown"');
    });
  }, 30_000);
});
