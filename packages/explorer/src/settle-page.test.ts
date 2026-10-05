// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTLE_QUIET_MS, DEFAULT_SETTLE_TIMEOUT_MS, settlePage } from './settle-page.js';

async function fakePage(evaluate: (arg: unknown) => unknown) {
  const launcher = createFakeBrowserLauncher();
  const page = await (await (await launcher.launch()).newContext()).newPage();
  const calls: unknown[] = [];
  page.evaluate = (_fn, arg) => {
    calls.push(arg);
    return Promise.resolve(evaluate(arg));
  };
  return { page, calls, launcher };
}

describe('settlePage', () => {
  it('hands the page the busy selectors, the timeout and the quiet window, defaulting the first two', async () => {
    const { page, calls } = await fakePage(() => true);

    await expect(settlePage(page, 'https://app.example.test/')).resolves.toBe(true);
    await expect(
      settlePage(page, 'https://app.example.test/', { busySelectors: ['.spinner'], timeoutMs: 1234 }),
    ).resolves.toBe(true);

    expect(calls).toEqual([
      { busySelectors: [], timeoutMs: DEFAULT_SETTLE_TIMEOUT_MS, quietMs: DEFAULT_SETTLE_QUIET_MS },
      { busySelectors: ['.spinner'], timeoutMs: 1234, quietMs: DEFAULT_SETTLE_QUIET_MS },
    ]);
  });

  it('reports a page that did not settle and still returns, so the page is read as it is', async () => {
    const { page } = await fakePage(() => false);
    const onUnsettled = vi.fn();

    await expect(settlePage(page, 'https://app.example.test/slow', { onUnsettled })).resolves.toBe(false);

    expect(onUnsettled).toHaveBeenCalledExactlyOnceWith('https://app.example.test/slow');
  });

  it('does not report a page that settled', async () => {
    const { page } = await fakePage(() => true);
    const onUnsettled = vi.fn();

    await settlePage(page, 'https://app.example.test/', { onUnsettled });

    expect(onUnsettled).not.toHaveBeenCalled();
  });

  it('looks again after a navigation destroyed the execution context', async () => {
    let attempts = 0;
    const { page, launcher } = await fakePage(() => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('Execution context was destroyed');
      }
      return true;
    });

    await expect(settlePage(page, 'https://app.example.test/')).resolves.toBe(true);

    expect(attempts).toBe(2);
    expect(launcher.pageCalls.some((call) => call.method === 'waitForLoadState')).toBe(true);
  });

  it('reports a page that keeps navigating as unsettled instead of failing', async () => {
    const { page } = await fakePage(() => {
      throw new Error('Execution context was destroyed');
    });
    const onUnsettled = vi.fn();

    await expect(settlePage(page, 'https://app.example.test/', { onUnsettled })).resolves.toBe(false);

    expect(onUnsettled).toHaveBeenCalledOnce();
  });
});
