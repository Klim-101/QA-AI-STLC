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
import type { BrowserOperationContext } from '../src/operations/browser-context.js';
import { runBrowserNavigate } from '../src/operations/browser-navigate.js';
import { runBrowserOpen } from '../src/operations/browser-open.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { playwrightBrowserLauncher } from '../src/ports/browser-launcher.js';
import { systemClock } from '../src/ports/clock.js';
import { fetchHttpClient } from '../src/ports/http-client.js';
import { noopLogger } from '../src/ports/logger.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';

const PORT = 4402;
const BASE_URL = `http://localhost:${String(PORT)}/`;
const STARTUP_TIMEOUT_MS = 60_000;

let demoApp: ManagedServer;

beforeAll(async () => {
  demoApp = await startDemoApp(PORT);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(async () => {
  await demoApp.stop();
});

function configYaml(actionTimeoutMs: number): string {
  return [
    'schemaVersion: 1',
    'testing: { e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
    'environments:',
    `  staging: { baseUrl: "${BASE_URL}", allowlist: ["localhost"], actionTimeoutMs: ${String(actionTimeoutMs)} }`,
    'identities: {}',
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
    'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
    'ui: { busySelectors: [".k-loading-mask"] }',
    '',
  ].join('\n');
}

async function withBusyContext(
  actionTimeoutMs: number,
  run: (context: BrowserOperationContext) => Promise<void>,
): Promise<void> {
  await withTempDir(async (projectRoot) => {
    await mkdir(join(projectRoot, '.qa'), { recursive: true });
    await writeFile(join(projectRoot, '.qa', 'config.yaml'), configYaml(actionTimeoutMs), 'utf-8');
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
    try {
      await run({ engine, sessions });
    } finally {
      await Promise.all(sessions.sessionIds.map((sessionId) => sessions.close(sessionId)));
    }
  });
}

// These run in the browser, where nothing from this module is available, and this package
// compiles without DOM types: each one types the page's `document` for itself.
interface FixtureDocument {
  getElementById(id: string): { click(): void; textContent: string | null } | null;
}

function clickRefresh(): void {
  const { document } = globalThis as unknown as { document: FixtureDocument };
  document.getElementById('refresh')?.click();
}

function readSaveStatus(): string | null | undefined {
  const { document } = globalThis as unknown as { document: FixtureDocument };
  return document.getElementById('save-status')?.textContent;
}

describe('busy indicator waits (demo app)', () => {
  it('waits for the loading mask to clear instead of losing a click issued under it', async () => {
    await withBusyContext(15_000, async (context) => {
      const { sessionId } = await runBrowserOpen(context, { environment: 'staging' });
      await runBrowserNavigate(context, { sessionId, url: `${BASE_URL}busy-fixture.html` });
      const session = await context.sessions.get(sessionId);
      // Raise the mask without an engine action; the mask does not intercept clicks, so without
      // the wait the Save click would land at once and be ignored.
      await session.page.evaluate(clickRefresh);

      await runBrowserClick(context, { sessionId, selector: '#save' });

      const statusText = await session.page.evaluate(readSaveStatus);
      expect(statusText).toBe('Saved.');
    });
  }, 60_000);

  it('fails with BROWSER_BUSY_TIMEOUT when the mask never clears within the action timeout', async () => {
    await withBusyContext(1_000, async (context) => {
      const { sessionId } = await runBrowserOpen(context, { environment: 'staging' });
      await expect(
        runBrowserNavigate(context, { sessionId, url: `${BASE_URL}busy-fixture.html?hold=1` }),
      ).rejects.toMatchObject({ code: 'BROWSER_BUSY_TIMEOUT' });
    });
  }, 60_000);
});
