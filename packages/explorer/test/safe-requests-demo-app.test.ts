// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SafeModeRequestTally, playwrightBrowserLauncher } from '@qa-ai-stlc/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crawl } from '../src/crawl.js';
import { createSafeModeRouteHandler } from '../src/safe-mode.js';

// A fixed port, not 0: the demo app logs the port it was told to bind to, not the one the OS
// actually assigned. Distinct from the ports the other demo-app tests use.
const PORT = 4420;
const BASE_URL = `http://localhost:${String(PORT)}`;
const STARTUP_TIMEOUT_MS = 60_000;
const SESSION_REQUEST = {
  method: 'POST',
  path: '/api/spa/session',
  reason: 'Opens the session of the application; creates no record.',
} as const;

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
  await waitForServer(`${BASE_URL}/login`, STARTUP_TIMEOUT_MS);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(() => {
  demoApp.kill();
});

async function orderCount(): Promise<number> {
  const response = await fetch(`${BASE_URL}/api/spa/orders`);
  return ((await response.json()) as { orders: number }).orders;
}

// A single-page application that opens its session with a POST on every load cannot start under
// GET-only safe mode (ADR-0014).
describe('safeNonGetRequests against a session-by-POST page (demo app)', () => {
  it('crawls past the page when the environment lists the POST that opens the session', async () => {
    const tally = new SafeModeRequestTally();

    const result = await crawl({
      startUrl: `${BASE_URL}/spa-session.html`,
      allowlist: ['localhost'],
      browserLauncher: playwrightBrowserLauncher,
      safeMode: { safeRequests: [SESSION_REQUEST], tally },
    });

    expect(result.routeMap.routes.map((route) => route.url)).toEqual([
      `${BASE_URL}/spa-session.html`,
      `${BASE_URL}/spa-fixture-detail.html`,
    ]);
    expect(result.blockedRequestCount).toBe(0);
    expect(tally.summary()).toEqual({
      allowed: [{ method: 'POST', path: '/api/spa/session', count: 1 }],
      blocked: [],
    });
    expect(result.requestLogHar).toContain('"_allowedByConfig":true');
  }, 60_000);

  it('finds nothing past the page without the entry, and names the request it stalled on', async () => {
    const tally = new SafeModeRequestTally();

    const result = await crawl({
      startUrl: `${BASE_URL}/spa-session.html`,
      allowlist: ['localhost'],
      browserLauncher: playwrightBrowserLauncher,
      settle: { timeoutMs: 1_500 },
      safeMode: { tally },
    });

    expect(result.routeMap.routes.map((route) => route.url)).toEqual([`${BASE_URL}/spa-session.html`]);
    expect(tally.summary().blocked).toEqual([{ method: 'POST', path: '/api/spa/session', count: 1 }]);
  }, 60_000);

  it('keeps blocking every other non-GET request, which never reaches the server', async () => {
    const tally = new SafeModeRequestTally();
    const browser = await playwrightBrowserLauncher.launch();
    try {
      const page = await (await browser.newContext()).newPage();
      await page.route(
        '**/*',
        createSafeModeRouteHandler(['localhost'], `${BASE_URL}/`, () => undefined, {
          safeRequests: [SESSION_REQUEST],
          tally,
        }),
      );
      await page.goto(`${BASE_URL}/spa-session.html`);
      await page.click('#place-order');
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      await browser.close();
    }

    expect(await orderCount()).toBe(0);
    expect(tally.summary().blocked).toEqual([{ method: 'POST', path: '/api/spa/orders', count: 1 }]);
  }, 60_000);
});
