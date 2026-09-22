// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { createFakeExploreBrowserLauncher } from './fake-explore-browser-launcher.js';

describe('createFakeExploreBrowserLauncher', () => {
  it('rejects newContext() and tracks close() on a browser obtained through connectOverCdp', async () => {
    const storageState = { cookies: [], origins: [] };
    const launcher = createFakeExploreBrowserLauncher({ authStorageState: storageState });

    const browser = await launcher.connectOverCdp('http://localhost:9222');
    const [context] = browser.contexts();

    await expect(browser.newContext()).rejects.toThrow('newContext is not available');
    await expect(context?.storageState()).resolves.toEqual(storageState);
    await expect(context?.newPage()).resolves.toBe(launcher.page);
    await expect(context?.close()).resolves.toBeUndefined();
    await browser.close();
    expect(launcher.closedBrowsers.count).toBe(1);
  });

  it('defaults connectOverCdp storageState to an empty session when none is configured', async () => {
    const launcher = createFakeExploreBrowserLauncher();

    const browser = await launcher.connectOverCdp('http://localhost:9222');
    const [context] = browser.contexts();

    await expect(context?.storageState()).resolves.toEqual({ cookies: [], origins: [] });
  });

  it('exposes a closable context through launch() and contexts(), tracking close()', async () => {
    const launcher = createFakeExploreBrowserLauncher();

    const browser = await launcher.launch();
    const context = await browser.newContext();

    expect(browser.contexts()).toEqual([context]);
    await expect(context.close()).resolves.toBeUndefined();
    await browser.close();
    expect(launcher.closedBrowsers.count).toBe(1);
  });

  it('defaults every locator method to a count of 1 when none is configured', async () => {
    const launcher = createFakeExploreBrowserLauncher();
    const browser = await launcher.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    await expect(page.getByRole('button').count()).resolves.toBe(1);
  });

  it('resolves getByRole() and friends to the configured locator count', async () => {
    const launcher = createFakeExploreBrowserLauncher({ locatorCount: 3 });
    const browser = await launcher.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    await expect(page.getByRole('button').count()).resolves.toBe(3);
    await expect(page.getByTestId('x').count()).resolves.toBe(3);
    await expect(page.getByLabel('x').count()).resolves.toBe(3);
    await expect(page.getByPlaceholder('x').count()).resolves.toBe(3);
    await expect(page.getByText('x').count()).resolves.toBe(3);
    await expect(page.locator('x').count()).resolves.toBe(3);
  });

  it('reports the aria snapshot, viewport and reload response the same on every call', async () => {
    const launcher = createFakeExploreBrowserLauncher();
    const browser = await launcher.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    await expect(page.ariaSnapshotJSON()).resolves.toEqual({ role: 'document' });
    expect(page.viewportSize()).toBeNull();
    await expect(page.reload()).resolves.toEqual(expect.objectContaining({}));
    await expect(page.setViewportSize({ width: 100, height: 100 })).resolves.toBeUndefined();
    await expect(page.fill('input', 'x')).resolves.toBeUndefined();
    await expect(page.click('button')).resolves.toBeUndefined();
    await expect(page.waitForLoadState()).resolves.toBeUndefined();
    await expect(page.route('**/*', () => undefined)).resolves.toBeUndefined();
  });

  it('resolves evaluate() to undefined before any goto() call and no options configured', async () => {
    const launcher = createFakeExploreBrowserLauncher();
    const browser = await launcher.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    await expect(page.evaluate(() => 'ignored')).resolves.toBeUndefined();
  });

  it('resolves evaluate() to the pick-mode state configured, even before goto()', async () => {
    const pickModeState = { done: true, captures: [] };
    const launcher = createFakeExploreBrowserLauncher({ pickModeState });
    const browser = await launcher.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    await expect(page.evaluate(() => 'ignored')).resolves.toEqual(pickModeState);
  });

  it('resolves evaluate() to the elements configured for the current URL after goto()', async () => {
    const launcher = createFakeExploreBrowserLauncher({
      elementsByUrl: { 'https://example.com/': { interactiveElements: [] } },
    });
    const browser = await launcher.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('https://example.com/');

    await expect(page.evaluate(() => 'ignored')).resolves.toEqual({ interactiveElements: [] });
  });

  it('resolves evaluate() to an empty array after goto() when neither elements nor links are configured', async () => {
    const launcher = createFakeExploreBrowserLauncher();
    const browser = await launcher.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('https://example.com/');

    await expect(page.evaluate(() => 'ignored')).resolves.toEqual([]);
  });

  it('resolves evaluate() to the links configured for the current URL after goto()', async () => {
    const launcher = createFakeExploreBrowserLauncher({
      linksByUrl: { 'https://example.com/': ['https://example.com/other'] },
    });
    const browser = await launcher.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('https://example.com/');

    await expect(page.evaluate(() => 'ignored')).resolves.toEqual(['https://example.com/other']);
  });

  it('replays configured subrequests through every registered route handler on goto()', async () => {
    const launcher = createFakeExploreBrowserLauncher({
      subRequestsByUrl: {
        'https://example.com/': [
          { method: 'GET', url: 'https://example.com/style.css' },
          { method: 'POST', url: 'https://example.com/analytics' },
        ],
      },
    });
    const page = await (await (await launcher.launch()).newContext()).newPage();
    const seen: { method: string; url: string }[] = [];
    await page.route('**/*', (route) => {
      seen.push({ method: route.request().method(), url: route.request().url() });
      return route.request().method() === 'GET' ? route.continue() : route.abort();
    });

    await page.goto('https://example.com/');

    expect(seen).toEqual([
      { method: 'GET', url: 'https://example.com/style.css' },
      { method: 'POST', url: 'https://example.com/analytics' },
    ]);
  });

  it('reports the current URL, an empty title and screenshot bytes', async () => {
    const launcher = createFakeExploreBrowserLauncher();
    const page = await (await (await launcher.launch()).newContext()).newPage();

    expect(page.url()).toBe('about:blank');
    await page.goto('https://example.com/');
    expect(page.url()).toBe('https://example.com/');
    expect(await page.title()).toBe('');
    expect((await page.screenshot()).byteLength).toBeGreaterThan(0);
  });
});
