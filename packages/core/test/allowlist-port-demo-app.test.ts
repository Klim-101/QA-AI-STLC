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
import { runBrowserClose } from '../src/operations/browser-close.js';
import { runBrowserNavigate } from '../src/operations/browser-navigate.js';
import { runBrowserOpen } from '../src/operations/browser-open.js';
import { runBrowserSnapshot } from '../src/operations/browser-snapshot.js';
import { playwrightBrowserLauncher } from '../src/ports/browser-launcher.js';
import { systemClock } from '../src/ports/clock.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { fetchHttpClient } from '../src/ports/http-client.js';
import { noopLogger } from '../src/ports/logger.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';

// Fixed ports, not 0: the demo app logs the port it was told to bind to, not the one the OS
// actually assigned. Distinct from the ports the other demo-app tests use. The application is
// served from PORT, its API from API_PORT, and a second API that no allowlist names from OTHER_PORT.
const PORT = 4702;
const API_PORT = 4703;
const OTHER_PORT = 4704;
const BASE_URL = `http://localhost:${String(PORT)}/`;
const PAGE_URL = `${BASE_URL}spa-cross-origin.html?api=${String(API_PORT)}&other=${String(OTHER_PORT)}`;
const STARTUP_TIMEOUT_MS = 60_000;

const servers: ManagedServer[] = [];

beforeAll(
  async () => {
    servers.push(await startDemoApp(PORT), await startDemoApp(API_PORT), await startDemoApp(OTHER_PORT));
  },
  STARTUP_TIMEOUT_MS * 3 + 5_000,
);

afterAll(async () => {
  await Promise.all(servers.map((server) => server.stop()));
});

async function readsOf(port: number): Promise<number> {
  const response = await fetch(`http://localhost:${String(port)}/api/cross/reads`);
  return ((await response.json()) as { reads: number }).reads;
}

function configYaml(allowlist: string): string {
  return [
    'schemaVersion: 1',
    'testing: { e2e: in-scope, api: out-of-scope, a11y: undecided, security: undecided }',
    'environments:',
    `  staging: { baseUrl: "${BASE_URL}", allowlist: [${allowlist}] }`,
    'identities: {}',
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
    'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
    '',
  ].join(String.fromCharCode(10));
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

// A page on one port that reads from an API on another: the case the allowlist could not express
// before an entry could carry a port (ADR-0019, AGENTS.md section 13).
describe('an allowlist entry with a port in a browser session (demo app)', () => {
  it('blocks the API on another port when the allowlist names only the host', async () => {
    await withProject(configYaml('"localhost"'), async (browserContext) => {
      const apiReadsBefore = await readsOf(API_PORT);
      const { sessionId } = await runBrowserOpen(browserContext);
      await runBrowserNavigate(browserContext, { sessionId, url: PAGE_URL });
      await new Promise((resolve) => setTimeout(resolve, 500));

      const view = JSON.stringify((await runBrowserSnapshot(browserContext, { sessionId })).view);
      const closed = await runBrowserClose(browserContext, { sessionId });

      expect(view).not.toContain('Claw hammer');
      expect((await readsOf(API_PORT)) - apiReadsBefore).toBe(0);
      expect(closed.requests.blockedCounts).toEqual({ method: 0, host: 0, scheme: 0, port: 2 });
    });
  }, 60_000);

  it('loads the API the entry names, and keeps blocking another port of the same host', async () => {
    await withProject(configYaml(`"localhost", "localhost:${String(API_PORT)}"`), async (browserContext) => {
      const apiReadsBefore = await readsOf(API_PORT);
      const otherReadsBefore = await readsOf(OTHER_PORT);
      const { sessionId } = await runBrowserOpen(browserContext);
      await runBrowserNavigate(browserContext, { sessionId, url: PAGE_URL });
      await new Promise((resolve) => setTimeout(resolve, 500));

      const view = JSON.stringify((await runBrowserSnapshot(browserContext, { sessionId })).view);
      const closed = await runBrowserClose(browserContext, { sessionId });

      expect(view).toContain('Claw hammer');
      expect(view).toContain('Other port: 0 products');
      expect((await readsOf(API_PORT)) - apiReadsBefore).toBe(1);
      expect((await readsOf(OTHER_PORT)) - otherReadsBefore).toBe(0);
      expect(closed.requests.blockedCounts).toEqual({ method: 0, host: 0, scheme: 0, port: 1 });
      expect(closed.requests.blocked).toEqual([
        { method: 'GET', path: '/api/cross/products', count: 1, reason: 'port' },
      ]);
    });
  }, 60_000);

  it('refuses to navigate to a port nothing names, and says which entry would allow it', async () => {
    await withProject(configYaml(`"localhost", "localhost:${String(API_PORT)}"`), async (browserContext) => {
      const { sessionId } = await runBrowserOpen(browserContext);

      await expect(
        runBrowserNavigate(browserContext, {
          sessionId,
          url: `http://localhost:${String(OTHER_PORT)}/index.html`,
        }),
      ).rejects.toMatchObject({
        code: 'BROWSER_URL_NOT_ALLOWED',
        remediation: expect.stringContaining(`localhost:${String(OTHER_PORT)}`) as string,
      });
    });
  }, 60_000);
});
