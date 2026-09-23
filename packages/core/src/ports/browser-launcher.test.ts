// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest';

const launch = vi.fn();
const connectOverCDP = vi.fn();

vi.mock('playwright', () => ({
  chromium: { launch, connectOverCDP },
}));

function fakePlaywrightBrowser() {
  return {
    newContext: vi.fn().mockResolvedValue('context'),
    contexts: vi.fn().mockReturnValue(['context']),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe('playwrightBrowserLauncher', () => {
  beforeEach(() => {
    launch.mockReset();
    connectOverCDP.mockReset();
  });

  it('delegates launch() to chromium.launch() without ever starting a real browser here', async () => {
    const rawBrowser = fakePlaywrightBrowser();
    launch.mockResolvedValue(rawBrowser);
    const { playwrightBrowserLauncher } = await import('./browser-launcher.js');

    const browser = await playwrightBrowserLauncher.launch();
    await browser.newContext();

    expect(launch).toHaveBeenCalledWith({});
    expect(rawBrowser.newContext).toHaveBeenCalledWith({});
  });

  it('passes headless: false through to chromium.launch(), for pick mode', async () => {
    launch.mockResolvedValue(fakePlaywrightBrowser());
    const { playwrightBrowserLauncher } = await import('./browser-launcher.js');

    await playwrightBrowserLauncher.launch({ headless: false });

    expect(launch).toHaveBeenCalledWith({ headless: false });
  });

  it('delegates connectOverCdp() to chromium.connectOverCDP() with the given endpoint', async () => {
    const rawBrowser = fakePlaywrightBrowser();
    connectOverCDP.mockResolvedValue(rawBrowser);
    const { playwrightBrowserLauncher } = await import('./browser-launcher.js');

    const browser = await playwrightBrowserLauncher.connectOverCdp('http://localhost:9222');
    expect(browser.contexts()).toEqual(['context']);

    expect(connectOverCDP).toHaveBeenCalledWith('http://localhost:9222');
    expect(rawBrowser.contexts).toHaveBeenCalled();
  });

  it('passes storageState through to newContext() unchanged', async () => {
    const rawBrowser = fakePlaywrightBrowser();
    launch.mockResolvedValue(rawBrowser);
    const { playwrightBrowserLauncher } = await import('./browser-launcher.js');
    const browser = await playwrightBrowserLauncher.launch();
    const storageState = { cookies: [], origins: [] };

    await browser.newContext({ storageState });

    expect(rawBrowser.newContext).toHaveBeenCalledWith({ storageState });
  });

  it("translates ignoreHttpsErrors to Playwright's own ignoreHTTPSErrors (P2-18)", async () => {
    const rawBrowser = fakePlaywrightBrowser();
    launch.mockResolvedValue(rawBrowser);
    const { playwrightBrowserLauncher } = await import('./browser-launcher.js');
    const browser = await playwrightBrowserLauncher.launch();

    await browser.newContext({ ignoreHttpsErrors: true });

    expect(rawBrowser.newContext).toHaveBeenCalledWith({ ignoreHTTPSErrors: true });
  });

  it('combines storageState and ignoreHttpsErrors when both are given', async () => {
    const rawBrowser = fakePlaywrightBrowser();
    launch.mockResolvedValue(rawBrowser);
    const { playwrightBrowserLauncher } = await import('./browser-launcher.js');
    const browser = await playwrightBrowserLauncher.launch();
    const storageState = { cookies: [], origins: [] };

    await browser.newContext({ storageState, ignoreHttpsErrors: true });

    expect(rawBrowser.newContext).toHaveBeenCalledWith({ storageState, ignoreHTTPSErrors: true });
  });

  it('closes the underlying browser through close()', async () => {
    const rawBrowser = fakePlaywrightBrowser();
    launch.mockResolvedValue(rawBrowser);
    const { playwrightBrowserLauncher } = await import('./browser-launcher.js');
    const browser = await playwrightBrowserLauncher.launch();

    await browser.close();

    expect(rawBrowser.close).toHaveBeenCalled();
  });
});
