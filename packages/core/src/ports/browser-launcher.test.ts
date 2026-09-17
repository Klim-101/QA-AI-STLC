// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';

const launch = vi.fn().mockResolvedValue('launched-browser');
const connectOverCDP = vi.fn().mockResolvedValue('attached-browser');

vi.mock('playwright', () => ({
  chromium: { launch, connectOverCDP },
}));

describe('playwrightBrowserLauncher', () => {
  it('delegates launch() to chromium.launch() without ever starting a real browser here', async () => {
    const { playwrightBrowserLauncher } = await import('./browser-launcher.js');

    const result = await playwrightBrowserLauncher.launch();

    expect(result).toBe('launched-browser');
    expect(launch).toHaveBeenCalledWith();
  });

  it('delegates connectOverCdp() to chromium.connectOverCDP() with the given endpoint', async () => {
    const { playwrightBrowserLauncher } = await import('./browser-launcher.js');

    const result = await playwrightBrowserLauncher.connectOverCdp('http://localhost:9222');

    expect(result).toBe('attached-browser');
    expect(connectOverCDP).toHaveBeenCalledWith('http://localhost:9222');
  });
});
