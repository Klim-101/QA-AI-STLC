// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthSessionStore } from '../src/auth-session-store.js';
import { BrowserSessionStore } from '../src/browser-session-store.js';
import type { EngineContext } from '../src/engine-context.js';
import { runBrowserNavigate } from '../src/operations/browser-navigate.js';
import { runBrowserOpen } from '../src/operations/browser-open.js';
import { runHttpExecute } from '../src/operations/http-execute.js';
import { playwrightBrowserLauncher } from '../src/ports/browser-launcher.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { systemClock } from '../src/ports/clock.js';
import { fetchHttpClient } from '../src/ports/http-client.js';
import { noopLogger } from '../src/ports/logger.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';
import { QaStore } from '../src/qa-store.js';

// A fixed port, not 0: the demo app logs the port it was told to bind to, not the one the OS
// actually assigned. Distinct from the ports the other demo-app tests use.
const PORT = 4399;
const BASE_URL = `http://localhost:${String(PORT)}/`;
const STARTUP_TIMEOUT_MS = 60_000;
const TOKEN_PATTERN = /demo-token-\d+/u;

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
  '  tester: { auth: cdp-attach, secret: QA_TESTER_PASSWORD }',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  'apiAuth:',
  '  profiles:',
  '    fromCookie: { type: from-browser, source: { kind: cookie, name: api_token } }',
  '    fromLocal: { type: from-browser, source: { kind: local-storage, key: auth, jsonPath: token.access } }',
  '    fromSession: { type: from-browser, source: { kind: session-storage, key: sessionToken } }',
  '    fromHeader: { type: from-browser, source: { kind: request-header, header: Authorization } }',
  '',
].join('\n');

// Every text file under `.qa/evidence`, which is where an engine-registered record would land.
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

// Exercises the `from-browser` profile (P6-34) against a real browser and a real running
// application (AGENTS.md section 13): the page keeps a token in a cookie, localStorage and
// sessionStorage and sends it as a bearer header, and the engine reads each place back.
describe('from-browser auth profile (demo app)', () => {
  it('reads the token from all four sources, and from a saved storage state for two of them', async () => {
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
      const browserContext = { engine, sessions };
      const { sessionId } = await runBrowserOpen(browserContext);

      try {
        await runBrowserNavigate(browserContext, { sessionId, url: `${BASE_URL}token-demo.html` });
        const session = await sessions.get(sessionId);
        await session.page.waitForLoadState('networkidle');

        const results: unknown[] = [];
        const call = async (auth: string, source: Record<string, string>) => {
          const result = await runHttpExecute(engine, {
            runId: 'run-http',
            url: `${BASE_URL}api/whoami`,
            auth,
            ...source,
            sessions,
          });
          results.push(result);
          return result;
        };

        for (const auth of ['fromCookie', 'fromLocal', 'fromSession', 'fromHeader']) {
          expect((await call(auth, { browserSessionId: sessionId })).status).toBe(200);
        }

        await new AuthSessionStore(new QaStore({ projectRoot, fs: nodeFileSystem })).save(
          'tester',
          await session.context.storageState(),
        );
        expect((await call('fromCookie', { identity: 'tester' })).status).toBe(200);
        expect((await call('fromLocal', { identity: 'tester' })).status).toBe(200);
        for (const auth of ['fromSession', 'fromHeader']) {
          await expect(call(auth, { identity: 'tester' })).rejects.toMatchObject({
            code: 'API_AUTH_SOURCE_UNSUPPORTED',
          });
        }

        // The demo app echoes the token it accepted. None of it may reach a tool result or any
        // evidence the engine registered, including the browser session's own.
        expect(JSON.stringify(results)).not.toMatch(TOKEN_PATTERN);
        const evidence = await allEvidenceText(projectRoot);
        expect(evidence).toContain('whoami');
        expect(evidence).not.toMatch(TOKEN_PATTERN);
      } finally {
        await sessions.closeAll();
      }
    });
  }, 120_000);
});
