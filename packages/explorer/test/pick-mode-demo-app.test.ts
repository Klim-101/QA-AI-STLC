// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { playwrightBrowserLauncher } from '@qa-ai-stlc/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  capturePickModeElements,
  finalizeManualSelectorEntries,
  injectPickModeOverlay,
  waitForPickModeCompletion,
} from '../src/pick-mode.js';

// A different fixed port from crawl-demo-app.test.ts's 4391, so both integration test files can
// spawn their own demo app instance without a port collision.
const PORT = 4392;
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

// Exercises pick mode against a real browser and a real running application (AGENTS.md section 13):
// a real overlay injected into the live DOM, a real click Playwright dispatches at the "Log in"
// submit button, and the boundary a fake AuthPage cannot cover — that the overlay's capture-phase
// listener actually stops the click before it reaches the form and submits it.
describe('pick mode (demo app)', () => {
  it('captures a clicked element without letting its default action run, then builds a manual registry entry', async () => {
    const browser = await playwrightBrowserLauncher.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/login`);

    await injectPickModeOverlay(page);
    await page.click('button[type="submit"]');
    await page.click('#qa-pick-mode-finish');

    const captures = await waitForPickModeCompletion(page, { wait: () => Promise.resolve() });
    expect(captures).toEqual([
      expect.objectContaining({
        kind: 'button',
        tagName: 'button',
        accessibleName: 'Log in',
        role: 'button',
      }),
    ]);

    // The click never reached the real submit button: safe mode holds even in pick mode
    // (AGENTS.md 12.4), and the page never navigated away from /login.
    const currentUrl = await page.evaluate(() => window.location.href);
    expect(currentUrl).toBe(`${BASE_URL}/login`);

    const [element] = await capturePickModeElements(page, `${BASE_URL}/login`, captures);
    expect(element?.locatorCandidates[0]).toEqual({
      strategy: 'role',
      value: JSON.stringify({ role: 'button', name: 'Log in' }),
      fragile: false,
    });
    expect(element?.stabilityScore).toBe(1);

    const [entry] = finalizeManualSelectorEntries(
      element === undefined ? [] : [element],
      new Map([[element?.pickId ?? '', 'Log in button']]),
      '2026-09-18T00:00:00Z',
    );
    expect(entry).toEqual(expect.objectContaining({ name: 'logInButton', source: 'manual', kind: 'button' }));

    await context.close();
    await browser.close();
  }, 30_000);
});
