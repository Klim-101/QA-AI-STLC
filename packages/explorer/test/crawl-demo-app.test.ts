// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { playwrightBrowserLauncher } from '@qa-ai-stlc/core';
import type { IdentityConfig, LocatorCandidate } from '@qa-ai-stlc/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyzePages } from '../src/analyze-pages.js';
import { buildSelectorRegistry, diffSelectorRegistry } from '../src/build-selector-registry.js';
import { crawl } from '../src/crawl.js';
import { scoreLocatorStability } from '../src/stability-scoring.js';
import { synthesizeLocatorCandidates } from '../src/synthesize-locators.js';

// A fixed port, not 0: the demo app logs the port it was told to bind to, not the one the OS
// actually assigned, so port 0 would leave this test unable to find the real address.
const PORT = 4391;
const BASE_URL = `http://localhost:${String(PORT)}`;
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
  await waitForServer(`${BASE_URL}/login`, STARTUP_TIMEOUT_MS);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(() => {
  demoApp.kill();
});

// Exercises the crawler against a real browser and a real running application (AGENTS.md
// section 13: browser tests run against examples/demo-app only), the boundary a fake
// BrowserLauncher cannot cover: an actual page.evaluate() DOM extraction, actual navigation
// responses, and actual safe-mode request interception.
describe('crawl (demo app)', () => {
  it('crawls anonymously and stops at the unauthenticated login page', async () => {
    const result = await crawl({
      startUrl: `${BASE_URL}/login`,
      allowlist: ['localhost'],
      browserLauncher: playwrightBrowserLauncher,
    });

    expect(result.routeMap.routes).toEqual([
      { url: `${BASE_URL}/login`, discoveredVia: 'link', httpStatus: 200 },
    ]);
    expect(result.blockedRequestCount).toBe(0);
  }, 30_000);

  it('signs in as admin and discovers every reachable page without sending a non-GET request', async () => {
    const identityConfig: IdentityConfig = {
      auth: 'storage-state',
      secret: 'QA_DEMO_ADMIN_PASSWORD',
      loginUrl: `${BASE_URL}/login`,
      username: 'admin@example.com',
    };

    const result = await crawl({
      startUrl: `${BASE_URL}/dashboard`,
      allowlist: ['localhost'],
      browserLauncher: playwrightBrowserLauncher,
      identity: { config: identityConfig, env: { QA_DEMO_ADMIN_PASSWORD: 'admin123' } },
    });

    const urls = result.routeMap.routes.map((route) => route.url);
    expect(urls).toEqual(
      expect.arrayContaining([
        `${BASE_URL}/dashboard`,
        `${BASE_URL}/tasks`,
        `${BASE_URL}/tasks/new`,
        `${BASE_URL}/admin/users`,
      ]),
    );
    expect(result.routeMap.routes.every((route) => route.httpStatus === 200)).toBe(true);
    expect(result.blockedRequestCount).toBe(0);
  }, 30_000);
});

// Exercises page analysis against the same real browser and application: a real
// page.ariaSnapshotJSON() accessibility tree and real DOM extraction of interactive elements,
// forms, tables and dialogs (AGENTS.md section 13).
describe('analyzePages (demo app)', () => {
  it('produces a structured page model for the login page, tasks list and new-task form', async () => {
    const result = await analyzePages({
      urls: [`${BASE_URL}/login`, `${BASE_URL}/tasks/new`],
      allowlist: ['localhost'],
      baseUrl: BASE_URL,
      browserLauncher: playwrightBrowserLauncher,
      identity: {
        config: {
          auth: 'storage-state',
          secret: 'QA_DEMO_ADMIN_PASSWORD',
          loginUrl: `${BASE_URL}/login`,
          username: 'admin@example.com',
        },
        env: { QA_DEMO_ADMIN_PASSWORD: 'admin123' },
      },
    });

    const [loginPage, newTaskPage] = result.pageModelSet.pages;
    expect(loginPage?.accessibilityTree.role).toBe('main');
    expect(loginPage?.accessibilityTree.children?.length).toBeGreaterThan(0);
    expect(loginPage?.forms).toEqual([expect.objectContaining({ method: 'post', action: '/login' })]);
    expect(newTaskPage?.forms.length).toBeGreaterThan(0);
    expect(newTaskPage?.interactiveElements.some((element) => element.kind === 'link')).toBe(true);
    expect(result.blockedRequestCount).toBe(0);
  }, 30_000);

  // The login form deliberately catalogues an accessibility bug (BUG-006): the password field's
  // `<label>` has no `for`, so it never associates with the input. Synthesizing locators against
  // real DOM extraction proves both the happy path (email, labeled correctly) and the degraded
  // one (password, falling back all the way to the CSS candidate) without relying on a fixture
  // written by hand to already have the right shape.
  it('extracts real label associations and degrades gracefully to css when they are missing', async () => {
    const result = await analyzePages({
      urls: [`${BASE_URL}/login`],
      allowlist: ['localhost'],
      baseUrl: BASE_URL,
      browserLauncher: playwrightBrowserLauncher,
    });

    const inputs = result.pageModelSet.pages[0]?.interactiveElements.filter(
      (element) => element.tagName === 'input',
    );
    const [emailInput, passwordInput] = inputs ?? [];

    expect(emailInput).toEqual(expect.objectContaining({ role: 'textbox', label: 'Email', htmlId: 'email' }));
    expect(passwordInput).toEqual(expect.objectContaining({ role: 'textbox' }));
    expect(passwordInput?.htmlId).toBeUndefined();
    expect(passwordInput?.label).toBeUndefined();

    const emailCandidates = synthesizeLocatorCandidates(emailInput!, 'playwright-default');
    expect(emailCandidates.map((candidate) => candidate.strategy)).toEqual(['role', 'label', 'css']);
    expect(emailCandidates.at(-1)).toEqual({ strategy: 'css', value: '#email', fragile: true });

    const passwordCandidates = synthesizeLocatorCandidates(passwordInput!, 'playwright-default');
    expect(passwordCandidates).toHaveLength(1);
    expect(passwordCandidates[0]?.strategy).toBe('css');
    expect(passwordCandidates[0]?.fragile).toBe(true);
  }, 30_000);
});

// Exercises stability scoring against the same real browser and application: real
// getByRole()/locator() resolution, a real page.reload() and real page.setViewportSize() calls
// (AGENTS.md section 13), and the exit criterion that scores are reproducible across two runs.
describe('scoreLocatorStability (demo app)', () => {
  it('scores a real, uniquely-resolving candidate identically across two runs', async () => {
    const browser = await playwrightBrowserLauncher.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/login`);

    const roleCandidate: LocatorCandidate = {
      strategy: 'role',
      value: JSON.stringify({ role: 'button', name: 'Log in' }),
      fragile: false,
    };

    const firstScore = await scoreLocatorStability(page, roleCandidate);
    const secondScore = await scoreLocatorStability(page, roleCandidate);

    expect(firstScore).toBe(1);
    expect(secondScore).toBe(1);

    await context.close();
    await browser.close();
  }, 30_000);

  it('scores 0 for a candidate that does not resolve to any real element', async () => {
    const browser = await playwrightBrowserLauncher.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/login`);

    const missingCandidate: LocatorCandidate = {
      strategy: 'testId',
      value: 'does-not-exist',
      fragile: false,
    };

    await expect(scoreLocatorStability(page, missingCandidate)).resolves.toBe(0);

    await context.close();
    await browser.close();
  }, 30_000);
});

// Exercises the full P1-06..P1-10 chain against the same real browser and application: a real
// page model feeds real locator synthesis and real stability scoring, assembled into a registry
// twice in a row to demonstrate the exit criterion that a diff between two crawls of an unchanged
// application reports nothing new, removed or degraded.
describe('buildSelectorRegistry (demo app)', () => {
  it('produces a stable registry with no diff between two runs against an unchanged page', async () => {
    const { pageModelSet } = await analyzePages({
      urls: [`${BASE_URL}/login`],
      allowlist: ['localhost'],
      baseUrl: BASE_URL,
      browserLauncher: playwrightBrowserLauncher,
    });

    const first = await buildSelectorRegistry({
      pageModelSet,
      allowlist: ['localhost'],
      baseUrl: BASE_URL,
      browserLauncher: playwrightBrowserLauncher,
    });
    const second = await buildSelectorRegistry({
      pageModelSet,
      allowlist: ['localhost'],
      baseUrl: BASE_URL,
      browserLauncher: playwrightBrowserLauncher,
    });

    expect(first.registry.elements.length).toBeGreaterThan(0);
    expect(first.registry.elements.every((selectorElement) => selectorElement.stabilityScore === 1)).toBe(
      true,
    );

    const diff = diffSelectorRegistry(first.registry, second.registry);
    expect(diff).toEqual({ added: [], removed: [], degraded: [] });
  }, 30_000);
});
