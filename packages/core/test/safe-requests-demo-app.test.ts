// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSessionStore } from '../src/browser-session-store.js';
import type { EngineContext } from '../src/engine-context.js';
import { runBrowserClick } from '../src/operations/browser-click.js';
import { runBrowserClose } from '../src/operations/browser-close.js';
import { runBrowserNavigate } from '../src/operations/browser-navigate.js';
import { runBrowserOpen } from '../src/operations/browser-open.js';
import { playwrightBrowserLauncher } from '../src/ports/browser-launcher.js';
import { systemClock } from '../src/ports/clock.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { fetchHttpClient } from '../src/ports/http-client.js';
import { noopLogger } from '../src/ports/logger.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';

// A fixed port, not 0: the demo app logs the port it was told to bind to, not the one the OS
// actually assigned. Distinct from the ports the other demo-app tests use.
const PORT = 4421;
const BASE_URL = `http://localhost:${String(PORT)}/`;
const STARTUP_TIMEOUT_MS = 60_000;

let demoApp: ManagedServer;

beforeAll(async () => {
  demoApp = await startDemoApp(PORT);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(async () => {
  await demoApp.stop();
});

function configYaml(safeNonGetRequests: string): string {
  return [
    'schemaVersion: 1',
    'testing: { e2e: in-scope, api: out-of-scope, a11y: undecided, security: undecided }',
    'environments:',
    `  staging: { baseUrl: "${BASE_URL}", allowlist: ["localhost"]${safeNonGetRequests} }`,
    'identities: {}',
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
    'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
    '',
  ].join(String.fromCharCode(10));
}

async function orderCount(): Promise<number> {
  const response = await fetch(`${BASE_URL}api/spa/orders`);
  return ((await response.json()) as { orders: number }).orders;
}

async function withProject(
  yaml: string,
  use: (context: { engine: EngineContext; sessions: BrowserSessionStore }) => Promise<void>,
) {
  await withTempDir(async (projectRoot) => {
    await mkdir(join(projectRoot, '.qa'), { recursive: true });
    await writeFile(join(projectRoot, '.qa', 'config.yaml'), yaml, 'utf-8');
    const engine: EngineContext = {
      projectRoot,
      fs: nodeFileSystem,
      clock: systemClock,
      logger: noopLogger,
      processRunner: nodeProcessRunner,
      httpClient: fetchHttpClient,
      browserLauncher: playwrightBrowserLauncher,
      env: {},
    };
    const sessions = new BrowserSessionStore();
    try {
      await use({ engine, sessions });
    } finally {
      await sessions.closeAll();
    }
  });
}

const SESSION_ENTRY =
  ', safeNonGetRequests: [{ method: POST, path: /api/spa/session, reason: "Opens the session of the application." }]';

// `safeNonGetRequests` in a real browser session (ADR-0014, AGENTS.md section 13).
describe('safeNonGetRequests in a browser session (demo app)', () => {
  it('starts an application that opens its session with a POST, and keeps blocking the others', async () => {
    await withProject(configYaml(SESSION_ENTRY), async (browserContext) => {
      const { sessionId } = await runBrowserOpen(browserContext);
      await runBrowserNavigate(browserContext, { sessionId, url: `${BASE_URL}spa-session.html` });
      await runBrowserClick(browserContext, { sessionId, selector: '#place-order' });
      await new Promise((resolve) => setTimeout(resolve, 500));

      const closed = await runBrowserClose(browserContext, { sessionId });

      expect(closed.requests).toEqual({
        allowed: [{ method: 'POST', path: '/api/spa/session', count: 1 }],
        blocked: [{ method: 'POST', path: '/api/spa/orders', count: 1 }],
      });
      expect(await orderCount()).toBe(0);
    });
  }, 60_000);

  it('leaves the page empty without the entry, and says which request it blocked', async () => {
    await withProject(configYaml(''), async (browserContext) => {
      const { sessionId } = await runBrowserOpen(browserContext);
      await runBrowserNavigate(browserContext, { sessionId, url: `${BASE_URL}spa-session.html` });
      await new Promise((resolve) => setTimeout(resolve, 500));

      const closed = await runBrowserClose(browserContext, { sessionId });

      expect(closed.requests.allowed).toEqual([]);
      expect(closed.requests.blocked).toEqual([{ method: 'POST', path: '/api/spa/session', count: 1 }]);
    });
  }, 60_000);
});
