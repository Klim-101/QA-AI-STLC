// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSessionStore } from '../src/browser-session-store.js';
import type { EngineContext } from '../src/engine-context.js';
import { runBrowserOpen } from '../src/operations/browser-open.js';
import { runHttpExecute } from '../src/operations/http-execute.js';
import { playwrightBrowserLauncher } from '../src/ports/browser-launcher.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { systemClock } from '../src/ports/clock.js';
import { fetchHttpClient } from '../src/ports/http-client.js';
import { noopLogger } from '../src/ports/logger.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';

// A fixed port, not 0: the demo app logs the port it was told to bind to, not the one the OS
// actually assigned. Distinct from the ports the other demo-app tests use.
const PORT = 4432;
const BASE_URL = `http://localhost:${String(PORT)}/`;
const STARTUP_TIMEOUT_MS = 60_000;
const SESSION_COOKIE = 'connect.sid';

let demoApp: ManagedServer;

beforeAll(async () => {
  demoApp = await startDemoApp(PORT);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(async () => {
  await demoApp.stop();
});

const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: undecided, api: out-of-scope, a11y: undecided, security: undecided }',
  'environments:',
  `  staging: { baseUrl: "${BASE_URL}", allowlist: ["localhost"] }`,
  'identities:',
  `  tester: { auth: storage-state, loginUrl: "${BASE_URL}login", username: admin@example.com, secret: QA_TESTER_PASSWORD }`,
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  'apiAuth:',
  '  profiles:',
  `    session: { type: from-browser, source: { kind: cookie, name: ${SESSION_COOKIE}, sendAs: cookie } }`,
  '',
].join('\n');

async function allEvidenceText(projectRoot: string): Promise<string> {
  const root = join(projectRoot, '.qa', 'evidence');
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const texts = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /\.(json|txt|md|html)$/u.test(entry.name))
      .map((entry) => readFile(join(entry.parentPath, entry.name), 'utf-8')),
  );
  return texts.join('\n');
}

// The demo app authenticates with a server-side session cookie and answers an anonymous request to
// a protected page with a redirect to its login page, which fetch follows to a 200 (P5-14).
describe('a cookie-session application (demo app)', () => {
  it('blocks an anonymous call and answers a call made as the signed-in identity', async () => {
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
        env: { QA_TESTER_PASSWORD: 'admin123' },
      };
      const sessions = new BrowserSessionStore();
      const browserContext = { engine, sessions };
      const taskListUrl = `${BASE_URL}tasks`;

      const anonymous = await runHttpExecute(engine, { runId: 'run-http', url: taskListUrl, sessions });
      expect(anonymous.status).toBe(200);
      expect(anonymous.blocked).toEqual({ reason: 'login-redirect', location: '/login' });

      const { sessionId } = await runBrowserOpen(browserContext, { identity: 'tester' });
      try {
        const session = await sessions.get(sessionId);
        const storageState = await session.context.storageState();
        const cookieValue = storageState.cookies.find((cookie) => cookie.name === SESSION_COOKIE)?.value;
        expect(cookieValue).toBeDefined();

        const signedIn = await runHttpExecute(engine, {
          runId: 'run-http',
          url: taskListUrl,
          auth: 'session',
          browserSessionId: sessionId,
          sessions,
        });
        expect(signedIn.status).toBe(200);
        expect(signedIn).not.toHaveProperty('blocked');

        const evidence = await allEvidenceText(projectRoot);
        expect(evidence).toContain('Tasks');
        expect(evidence).not.toContain(cookieValue);
      } finally {
        await sessions.closeAll();
      }
    });
  }, 120_000);
});
