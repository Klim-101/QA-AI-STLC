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
import { runBrowserSnapshot } from '../src/operations/browser-snapshot.js';
import { playwrightBrowserLauncher } from '../src/ports/browser-launcher.js';
import { systemClock } from '../src/ports/clock.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { fetchHttpClient } from '../src/ports/http-client.js';
import { noopLogger } from '../src/ports/logger.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';

// A fixed port, not 0: the demo app logs the port it was told to bind to, not the one the OS
// actually assigned. Distinct from the ports the other demo-app tests use.
const PORT = 4701;
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
  'testing: { e2e: in-scope, api: out-of-scope, a11y: undecided, security: undecided }',
  'environments:',
  `  staging: { baseUrl: "${BASE_URL}", allowlist: ["localhost"] }`,
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join(String.fromCharCode(10));

async function mutationCount(): Promise<number> {
  const response = await fetch(`${BASE_URL}api/spa/mutations`);
  return ((await response.json()) as { mutations: number }).mutations;
}

async function withProject(
  use: (context: { engine: EngineContext; sessions: BrowserSessionStore }) => Promise<void>,
) {
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

// Safe mode in a real browser session, against a page that reads with QUERY and mutates with the
// four other methods (ADR-0018, AGENTS.md section 13).
describe('safe methods in a browser session (demo app)', () => {
  it('loads a list read with QUERY and keeps aborting POST, PUT, PATCH and DELETE', async () => {
    await withProject(async (browserContext) => {
      const { sessionId } = await runBrowserOpen(browserContext);
      await runBrowserNavigate(browserContext, { sessionId, url: `${BASE_URL}spa-query.html` });

      const loaded = await runBrowserSnapshot(browserContext, { sessionId });
      expect(JSON.stringify(loaded.view)).toContain('Claw hammer');

      for (const method of ['post', 'put', 'patch', 'delete']) {
        await runBrowserClick(browserContext, { sessionId, selector: `#mutate-${method}` });
      }
      await new Promise((resolve) => setTimeout(resolve, 500));

      const closed = await runBrowserClose(browserContext, { sessionId });

      expect(closed.requests.blockedCounts).toEqual({ method: 4, host: 0, scheme: 0, port: 0 });
      expect(closed.requests.blocked.map((entry) => entry.method).sort()).toEqual([
        'DELETE',
        'PATCH',
        'POST',
        'PUT',
      ]);
      expect(await mutationCount()).toBe(0);
    });
  }, 60_000);
});
