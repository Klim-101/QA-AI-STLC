// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { createFakeCrawlBrowserLauncher } from './fake-browser-launcher.js';

describe('createFakeCrawlBrowserLauncher', () => {
  it('rejects newContext() and tracks close() on a browser obtained through connectOverCdp', async () => {
    const storageState = { cookies: [], origins: [] };
    const launcher = createFakeCrawlBrowserLauncher({ authStorageState: storageState });

    const browser = await launcher.connectOverCdp('http://localhost:9222');
    const [context] = browser.contexts();

    await expect(browser.newContext()).rejects.toThrow('newContext is not available');
    await expect(context?.storageState()).resolves.toEqual(storageState);
    await expect(context?.newPage()).resolves.toBe(launcher.page);
    await expect(context?.close()).resolves.toBeUndefined();
    await browser.close();
    expect(launcher.closedBrowsers).toBe(1);
  });

  it('exposes a closable context through launch() and contexts()', async () => {
    const launcher = createFakeCrawlBrowserLauncher();

    const browser = await launcher.launch();
    const context = await browser.newContext();

    expect(browser.contexts()).toEqual([context]);
    await expect(context.close()).resolves.toBeUndefined();
  });

  it('defaults connectOverCdp storageState to an empty session when none is configured', async () => {
    const launcher = createFakeCrawlBrowserLauncher();

    const browser = await launcher.connectOverCdp('http://localhost:9222');
    const [context] = browser.contexts();

    await expect(context?.storageState()).resolves.toEqual({ cookies: [], origins: [] });
  });

  it('resolves evaluate() and ariaSnapshotJSON() to undefined before any goto() call', async () => {
    const launcher = createFakeCrawlBrowserLauncher();

    const browser = await launcher.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    await expect(page.evaluate(() => 'ignored')).resolves.toBeUndefined();
    await expect(page.ariaSnapshotJSON()).resolves.toBeUndefined();
  });

  it('resolves ariaSnapshotJSON() to the snapshot configured for the current URL', async () => {
    const launcher = createFakeCrawlBrowserLauncher({
      ariaSnapshotByUrl: { 'https://example.com/': { role: 'document' } },
    });
    const browser = await launcher.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('https://example.com/');

    await expect(page.ariaSnapshotJSON()).resolves.toEqual({ role: 'document' });
  });
});
