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
import { runBrowserNavigate } from '../src/operations/browser-navigate.js';
import { runBrowserOpen } from '../src/operations/browser-open.js';
import { runBrowserSnapshot } from '../src/operations/browser-snapshot.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { playwrightBrowserLauncher } from '../src/ports/browser-launcher.js';
import { systemClock } from '../src/ports/clock.js';
import { fetchHttpClient } from '../src/ports/http-client.js';
import { noopLogger } from '../src/ports/logger.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';

const PORT = 4415;
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

interface FixtureNode {
  setAttribute(name: string, value: string): void;
  textContent: string;
  append(node: FixtureNode): void;
}

interface FixturePage {
  document: {
    createElement(tag: string): FixtureNode;
    querySelector(selector: string): FixtureNode | null;
  };
}

// Runs inside the page: opens a dialog with one button, the way a popup does.
function openPopup(): void {
  const { document } = globalThis as unknown as FixturePage;
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-label', 'Terms');
  const accept = document.createElement('button');
  accept.textContent = 'Accept terms';
  dialog.append(accept);
  document.querySelector('main')?.append(dialog);
}

describe('qa.browser_snapshot with since on the demo app', () => {
  it('returns only the popup that opened, keeps the old refs, and registers the full tree', async () => {
    await withContext(async (context, sessionId) => {
      const first = await runBrowserSnapshot(context, { sessionId });
      const session = await context.sessions.get(sessionId);
      await session.page.evaluate(openPopup);

      const second = await runBrowserSnapshot(context, { sessionId, since: first.snapshotId });

      const changed = second.view.text.split(/\r?\n/).filter((line) => /^[+-] /.test(line));
      expect(changed.map((line) => line.slice(0, 1))).toEqual(['+', '+']);
      expect(changed[0]).toContain('dialog "Terms"');
      expect(changed[1]).toContain('button "Accept terms" [ref=');
      expect(second.diff).toMatchObject({ since: first.snapshotId, removedCount: 0 });
      // The full tree is still the evidence, not the diff.
      const tree = JSON.parse(
        await readFile(join(context.engine.projectRoot, '.qa', second.accessibilityTree.path), 'utf-8'),
      ) as { tree: unknown };
      expect(JSON.stringify(tree.tree)).toContain('Accept terms');
      expect(first.view.refs.length).toBeGreaterThan(0);
      expect(second.view.refs.map((ref) => ref.ref)).toEqual(
        expect.arrayContaining(first.view.refs.map((ref) => ref.ref)),
      );
    });
  }, 30_000);

  it('refuses an unknown snapshot id with a coded error', async () => {
    await withContext(async (context, sessionId) => {
      await expect(runBrowserSnapshot(context, { sessionId, since: 'evidence-nope' })).rejects.toMatchObject({
        code: 'BROWSER_SNAPSHOT_UNKNOWN',
      });
    });
  }, 30_000);
});
