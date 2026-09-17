// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { createFakeBrowserLauncher } from './fake-browser-launcher.js';

describe('createFakeBrowserLauncher', () => {
  it('closes a context created through launch() without error', async () => {
    const launcher = createFakeBrowserLauncher();
    const browser = await launcher.launch();
    const context = await browser.newContext();

    await expect(context.close()).resolves.toBeUndefined();
  });

  it('exposes the launched context through contexts() too', async () => {
    const launcher = createFakeBrowserLauncher();
    const browser = await launcher.launch();
    const context = await browser.newContext();

    expect(browser.contexts()).toEqual([context]);
  });

  it('defaults connectOverCdp to no contexts when none are configured', async () => {
    const launcher = createFakeBrowserLauncher();

    const browser = await launcher.connectOverCdp('http://localhost:9222');

    expect(browser.contexts()).toEqual([]);
    await expect(browser.close()).resolves.toBeUndefined();
    expect(launcher.closedBrowsers).toBe(1);
  });

  it('rejects newContext() on a browser obtained through connectOverCdp', async () => {
    const launcher = createFakeBrowserLauncher();
    const browser = await launcher.connectOverCdp('http://localhost:9222');

    await expect(browser.newContext()).rejects.toThrow('newContext is not available');
  });

  it('defaults goto() to a 200 response and records route()/evaluate() calls', async () => {
    const launcher = createFakeBrowserLauncher();
    const browser = await launcher.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    const response = await page.goto('https://example.com');
    await page.route('**/*', () => undefined);
    const evaluated = await page.evaluate(() => 'ignored');

    expect(response?.status()).toBe(200);
    expect(evaluated).toBeUndefined();
    expect(launcher.pageCalls.map((call) => call.method)).toEqual(['goto', 'route', 'evaluate']);
  });

  it('returns the configured gotoResponse and evaluateResult', async () => {
    const launcher = createFakeBrowserLauncher({
      gotoResponse: { status: () => 404 },
      evaluateResult: ['https://example.com/a'],
    });
    const browser = await launcher.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    const response = await page.goto('https://example.com/missing');
    const evaluated = await page.evaluate(() => []);

    expect(response?.status()).toBe(404);
    expect(evaluated).toEqual(['https://example.com/a']);
  });

  it('honors an explicitly configured null gotoResponse', async () => {
    const launcher = createFakeBrowserLauncher({ gotoResponse: null });
    const browser = await launcher.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    await expect(page.goto('https://example.com')).resolves.toBeNull();
  });

  it('records the options passed to newContext(), defaulting to an empty object', async () => {
    const launcher = createFakeBrowserLauncher();
    const browser = await launcher.launch();
    const storageState = { cookies: [], origins: [] };

    await browser.newContext();
    await browser.newContext({ storageState });

    expect(launcher.newContextCalls).toEqual([{}, { storageState }]);
  });
});
