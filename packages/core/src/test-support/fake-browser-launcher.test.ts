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
});
