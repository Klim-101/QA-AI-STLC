// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSessionStore } from '../src/browser-session-store.js';
import type { EngineContext } from '../src/engine-context.js';
import type { BrowserOperationContext } from '../src/operations/browser-context.js';
import { runBrowserNavigate } from '../src/operations/browser-navigate.js';
import { runBrowserOpen } from '../src/operations/browser-open.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { playwrightBrowserLauncher } from '../src/ports/browser-launcher.js';
import { systemClock } from '../src/ports/clock.js';
import { fetchHttpClient } from '../src/ports/http-client.js';
import { noopLogger } from '../src/ports/logger.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';

const PORT = 4422;
const BASE_URL = `http://localhost:${String(PORT)}`;
const STARTUP_TIMEOUT_MS = 60_000;
const PASSWORD_ENV = 'QA_DEMO_ADMIN_PASSWORD';

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
  `  staging: { baseUrl: "${BASE_URL}/", allowlist: ["localhost"], actionTimeoutMs: 5000 }`,
  'identities:',
  `  admin: { auth: storage-state, secret: ${PASSWORD_ENV}, loginUrl: "${BASE_URL}/login", username: "admin@example.com" }`,
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

async function withContext(
  env: Record<string, string>,
  run: (context: BrowserOperationContext, projectRoot: string) => Promise<void>,
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
      env,
    };
    const sessions = new BrowserSessionStore();
    try {
      await run({ engine, sessions }, projectRoot);
    } finally {
      await Promise.all(sessions.sessionIds.map((sessionId) => sessions.close(sessionId)));
    }
  });
}

async function readAllFiles(directory: string): Promise<string> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const contents = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => readFile(join(entry.parentPath, entry.name), 'utf-8')),
  );
  return contents.join('\n');
}

describe('qa.browser_open with an identity against the demo app (P6-74)', () => {
  it('opens a protected page signed in, and is redirected to the login page without an identity', async () => {
    await withContext({ [PASSWORD_ENV]: 'admin123' }, async (context) => {
      const signedIn = await runBrowserOpen(context, { identity: 'admin' });
      const anonymous = await runBrowserOpen(context);

      const authenticated = await runBrowserNavigate(context, {
        sessionId: signedIn.sessionId,
        url: `${BASE_URL}/dashboard`,
      });
      const redirected = await runBrowserNavigate(context, {
        sessionId: anonymous.sessionId,
        url: `${BASE_URL}/dashboard`,
      });

      expect(signedIn.identity).toBe('admin');
      expect(authenticated.url).toBe(`${BASE_URL}/dashboard`);
      expect(redirected.url).toBe(`${BASE_URL}/login`);
    });
  }, 60_000);

  it('never writes the session cookie or the password into a result or the evidence store', async () => {
    await withContext({ [PASSWORD_ENV]: 'admin123' }, async (context, projectRoot) => {
      const result = await runBrowserOpen(context, { identity: 'admin' });
      await runBrowserNavigate(context, { sessionId: result.sessionId, url: `${BASE_URL}/dashboard` });

      const stored = await readAllFiles(join(projectRoot, '.qa', 'evidence'));
      expect(JSON.stringify(result)).not.toContain('admin123');
      expect(stored).not.toContain('admin123');
      expect(stored).not.toMatch(/connect\.sid/);
    });
  }, 60_000);

  it('fails with BROWSER_IDENTITY_UNKNOWN for an identity config.yaml does not define', async () => {
    await withContext({ [PASSWORD_ENV]: 'admin123' }, async (context) => {
      await expect(runBrowserOpen(context, { identity: 'nobody' })).rejects.toMatchObject({
        code: 'BROWSER_IDENTITY_UNKNOWN',
      });
      expect(context.sessions.sessionIds).toEqual([]);
    });
  }, 60_000);
});
