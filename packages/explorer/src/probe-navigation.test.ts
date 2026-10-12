// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  createFakeCrawlBrowserLauncher,
  type FakeCrawlBrowserLauncher,
} from '@qa-ai-stlc/test-utils/fake-crawl-browser-launcher';
import { createSafeModeRouteHandler } from './safe-mode.js';
import { probeNavigationControls, PROBE_CONTROL_SELECTOR } from './probe-navigation.js';

const PAGE_URL = 'https://example.com/';
const ALLOWLIST = ['example.com'];

async function probe(
  launcher: FakeCrawlBrowserLauncher,
  extra: { readonly maxProbes?: number } = {},
): ReturnType<typeof probeNavigationControls> {
  const browser = await launcher.launch();
  const page = await (await browser.newContext()).newPage();
  await page.goto(PAGE_URL);
  return probeNavigationControls({
    page,
    pageUrl: PAGE_URL,
    allowlist: ALLOWLIST,
    ...extra,
    openContext: async (onBlocked) => {
      const context = await browser.newContext();
      await context.route(
        '**/*',
        createSafeModeRouteHandler(ALLOWLIST, PAGE_URL, () => {
          onBlocked();
        }),
      );
      return context;
    },
  });
}

describe('probeNavigationControls', () => {
  it('keeps where a control led and discards the context it was probed in', async () => {
    const launcher = createFakeCrawlBrowserLauncher({
      probeControlIndexesByUrl: { [PAGE_URL]: [0, 2] },
      clickResultsByUrl: { [PAGE_URL]: { 0: { url: 'https://example.com/nodes#top' }, 2: {} } },
    });

    const result = await probe(launcher);

    expect(result).toEqual({ urls: ['https://example.com/nodes'], probeCount: 2 });
    expect(launcher.closedContexts).toBe(2);
    const probePages = launcher.pages.slice(1);
    expect(probePages.map((page) => page.gotoUrls)).toEqual([[PAGE_URL], [PAGE_URL]]);
    expect(probePages.map((page) => page.clickedSelectors)).toEqual([
      [`${PROBE_CONTROL_SELECTOR} >> nth=0`],
      [`${PROBE_CONTROL_SELECTOR} >> nth=2`],
    ]);
  });

  it('lists each destination once', async () => {
    const launcher = createFakeCrawlBrowserLauncher({
      probeControlIndexesByUrl: { [PAGE_URL]: [0, 1] },
      clickResultsByUrl: {
        [PAGE_URL]: { 0: { url: 'https://example.com/nodes' }, 1: { url: 'https://example.com/nodes' } },
      },
    });

    await expect(probe(launcher)).resolves.toEqual({ urls: ['https://example.com/nodes'], probeCount: 2 });
  });

  it('drops a destination outside the allowlist', async () => {
    const launcher = createFakeCrawlBrowserLauncher({
      probeControlIndexesByUrl: { [PAGE_URL]: [0] },
      clickResultsByUrl: { [PAGE_URL]: { 0: { url: 'https://evil.example.org/' } } },
    });

    await expect(probe(launcher)).resolves.toEqual({ urls: [], probeCount: 1 });
  });

  it('drops a destination when safe mode aborted a request during the probe', async () => {
    const launcher = createFakeCrawlBrowserLauncher({
      probeControlIndexesByUrl: { [PAGE_URL]: [0] },
      clickResultsByUrl: {
        [PAGE_URL]: {
          0: {
            url: 'https://example.com/nodes',
            subRequests: [{ method: 'POST', url: 'https://example.com/api/nodes' }],
          },
        },
      },
    });

    await expect(probe(launcher)).resolves.toEqual({ urls: [], probeCount: 1 });
  });

  it('keeps going when a control cannot be clicked, and still discards its context', async () => {
    const launcher = createFakeCrawlBrowserLauncher({
      probeControlIndexesByUrl: { [PAGE_URL]: [0, 1] },
      clickResultsByUrl: {
        [PAGE_URL]: { 0: { error: 'element is not visible' }, 1: { url: 'https://example.com/nodes' } },
      },
    });

    await expect(probe(launcher)).resolves.toEqual({ urls: ['https://example.com/nodes'], probeCount: 2 });
    expect(launcher.closedContexts).toBe(2);
  });

  it('probes nothing when the page lists no control', async () => {
    const launcher = createFakeCrawlBrowserLauncher();

    await expect(probe(launcher)).resolves.toEqual({ urls: [], probeCount: 0 });
    expect(launcher.closedContexts).toBe(0);
  });

  it('ignores non-integer indexes and honours the per-page cap', async () => {
    const launcher = createFakeCrawlBrowserLauncher({
      probeControlIndexesByUrl: { [PAGE_URL]: [0, 1.5, 3, 4] },
      clickResultsByUrl: { [PAGE_URL]: { 3: { url: 'https://example.com/nodes' } } },
    });

    await expect(probe(launcher, { maxProbes: 2 })).resolves.toEqual({
      urls: ['https://example.com/nodes'],
      probeCount: 2,
    });
    expect(launcher.pages).toHaveLength(3);
  });
});
