// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { chromium, type BrowserContext } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserSessionStore } from '../src/browser-session-store.js';
import type { EngineContext } from '../src/engine-context.js';
import { runBrowserAttach } from '../src/operations/browser-attach.js';
import { runBrowserClose } from '../src/operations/browser-close.js';
import { runBrowserNavigate } from '../src/operations/browser-navigate.js';
import { runHttpExecute } from '../src/operations/http-execute.js';
import { playwrightBrowserLauncher } from '../src/ports/browser-launcher.js';
import { systemClock } from '../src/ports/clock.js';
import { nodeFileSystem } from '../src/ports/file-system.js';
import { fetchHttpClient } from '../src/ports/http-client.js';
import { noopLogger } from '../src/ports/logger.js';
import { nodeProcessRunner } from '../src/ports/process-runner.js';

// A fixed port, not 0: the demo app logs the port it was told to bind to, not the one the OS
// actually assigned. Distinct from the ports the other demo-app tests use.
const PORT = 4418;
const BASE_URL = `http://localhost:${String(PORT)}/`;
const TOKEN_PAGE_URL = `${BASE_URL}token-demo.html`;
// The same server under another hostname: reachable, but not on the allowlist below.
const OFF_ALLOWLIST_URL = `http://127.0.0.1:${String(PORT)}/api/whoami`;
const STARTUP_TIMEOUT_MS = 60_000;
const TOKEN_PATTERN = /demo-token-\d+/u;

let demoApp: ChildProcess;
let operatorBrowser: BrowserContext;
let operatorProfileDir: string;
let debugPort: number;

async function waitFor(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`${url} did not become reachable within ${String(timeoutMs)}ms`);
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address === null || typeof address === 'string') {
          reject(new Error('no port was assigned'));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

beforeAll(
  async () => {
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
    await waitFor(`${BASE_URL}login`, STARTUP_TIMEOUT_MS);

    // The operator's own Chrome: a browser with a debugging port that is already on the page that
    // keeps a token, before the engine ever connects. Playwright starts it only so that closing it
    // at the end really ends the process; the engine reaches it over the port like any other.
    debugPort = await freePort();
    operatorProfileDir = await mkdtemp(join(tmpdir(), 'qa-ai-stlc-operator-'));
    operatorBrowser = await chromium.launchPersistentContext(operatorProfileDir, {
      headless: true,
      args: [`--remote-debugging-port=${String(debugPort)}`],
    });
    const operatorPage = await operatorBrowser.newPage();
    await operatorPage.goto(TOKEN_PAGE_URL);
    await operatorPage.waitForLoadState('networkidle');
  },
  2 * STARTUP_TIMEOUT_MS + 5_000,
);

afterAll(async () => {
  await operatorBrowser.close();
  demoApp.kill();
  // Chrome may hold files in its profile for a moment after it exits; a leftover directory under
  // the OS temp folder is harmless, a failed teardown is not.
  await rm(operatorProfileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(
    () => undefined,
  );
}, 30_000);

function configYaml(allowlist: string, baseUrl: string): string {
  return [
    'schemaVersion: 1',
    'testing: { e2e: undecided, api: out-of-scope, a11y: undecided, security: undecided }',
    'environments:',
    `  staging: { baseUrl: "${baseUrl}", allowlist: ["${allowlist}"] }`,
    'identities: {}',
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
}

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

async function withProject(
  yaml: string,
  use: (parts: { engine: EngineContext; sessions: BrowserSessionStore }) => Promise<void>,
): Promise<void> {
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

// Exercises `qa.browser_attach` (P6-50) against a real Chrome the test started the way an operator
// would (a debugging port, already on the application) and the real demo app (AGENTS.md section 13).
describe('qa.browser_attach (demo app, operator-started Chrome)', () => {
  it('reads the token from all four sources, keeps the operator browser open and leaks no token', async () => {
    await withProject(configYaml('localhost', BASE_URL), async ({ engine, sessions }) => {
      const browserContext = { engine, sessions };
      const attached = await runBrowserAttach(browserContext, {
        endpoint: `http://127.0.0.1:${String(debugPort)}`,
      });
      expect(attached.pageUrl).toBe(TOKEN_PAGE_URL);
      const session = await sessions.get(attached.sessionId);
      await session.page.waitForLoadState('networkidle');

      // The page signed in before the engine attached, so the header is not seen yet. Loading the
      // page again makes it send one while the session is watching.
      await runBrowserNavigate(browserContext, { sessionId: attached.sessionId, url: TOKEN_PAGE_URL });
      await session.page.waitForLoadState('networkidle');
      await session.page.locator('body[data-ready="200"]').evaluate(() => true);

      const results: unknown[] = [attached];
      for (const auth of ['fromCookie', 'fromLocal', 'fromSession', 'fromHeader']) {
        const result = await runHttpExecute(engine, {
          runId: 'run-http',
          url: `${BASE_URL}api/whoami`,
          auth,
          browserSessionId: attached.sessionId,
          sessions,
        });
        results.push(result);
        expect(result.status).toBe(200);
      }

      // The page is driven under safe mode and the allowlist: a request to a host that is not on
      // it never leaves the browser.
      const offAllowlist = await session.page.evaluate(async (url) => {
        try {
          // no-cors: the server sends no CORS headers, so only an aborted request rejects here.
          await fetch(url, { mode: 'no-cors' });
          return 'reached';
        } catch {
          return 'blocked';
        }
      }, OFF_ALLOWLIST_URL);
      expect(offAllowlist).toBe('blocked');
      await expect(
        runBrowserNavigate(browserContext, { sessionId: attached.sessionId, url: OFF_ALLOWLIST_URL }),
      ).rejects.toMatchObject({ code: 'BROWSER_URL_NOT_ALLOWED' });

      expect(JSON.stringify(results)).not.toMatch(TOKEN_PATTERN);
      const evidence = await allEvidenceText(engine.projectRoot);
      expect(evidence).toContain('"type": "attach"');
      expect(evidence).not.toMatch(TOKEN_PATTERN);

      // Closing disconnects: the operator's Chrome and its page are still there, and the page is
      // no longer under the session's safe mode.
      await runBrowserClose(browserContext, { sessionId: attached.sessionId });
      expect(sessions.sessionIds).toEqual([]);
      const afterClose = await chromium.connectOverCDP(`http://127.0.0.1:${String(debugPort)}`);
      try {
        const page = afterClose
          .contexts()
          .flatMap((context) => context.pages())
          .find((candidate) => candidate.url() === TOKEN_PAGE_URL);
        expect(page).toBeDefined();
        const afterwards = await page?.evaluate(async (url) => {
          try {
            await fetch(url, { mode: 'no-cors' });
            return 'reached';
          } catch {
            return 'blocked';
          }
        }, OFF_ALLOWLIST_URL);
        expect(afterwards).toBe('reached');
      } finally {
        await afterClose.close();
      }
    });
  }, 120_000);

  it('refuses an endpoint that is not on this machine', async () => {
    await withProject(configYaml('localhost', BASE_URL), async ({ engine, sessions }) => {
      await expect(
        runBrowserAttach({ engine, sessions }, { endpoint: 'http://203.0.113.7:9222' }),
      ).rejects.toMatchObject({ code: 'BROWSER_ATTACH_ENDPOINT_NOT_LOOPBACK' });
    });
  });

  it('refuses a browser none of whose pages is on the allowlist, and leaves it running', async () => {
    await withProject(
      configYaml('app.example.test', 'http://app.example.test:4418/'),
      async ({ engine, sessions }) => {
        await expect(
          runBrowserAttach({ engine, sessions }, { endpoint: `http://127.0.0.1:${String(debugPort)}` }),
        ).rejects.toMatchObject({ code: 'BROWSER_ATTACH_NO_PAGE' });

        expect(sessions.sessionIds).toEqual([]);
        const response = await fetch(`http://127.0.0.1:${String(debugPort)}/json/version`);
        expect(response.ok).toBe(true);
      },
    );
  }, 60_000);
});
