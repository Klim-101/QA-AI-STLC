// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { playwrightBrowserLauncher } from '@qa-ai-stlc/core';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyzePages } from '../src/analyze-pages.js';
import { crawl } from '../src/crawl.js';

// A fixed port, not 0: the demo app logs the port it was told to bind to, not the one the OS
// actually assigned. Distinct from the ports the other demo-app tests use.
const PORT = 4419;
const BASE_URL = `http://localhost:${String(PORT)}`;
const STARTUP_TIMEOUT_MS = 60_000;
const BUSY_SELECTORS = ['.k-loading-mask'];

let demoApp: ManagedServer;

beforeAll(async () => {
  demoApp = await startDemoApp(PORT);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(async () => {
  await demoApp.stop();
});

// A single-page application renders after the load event, so an explore that reads the page
// right after `goto` finds an empty root element (P6-63).
describe('explore against a client-rendered page (demo app)', () => {
  it('crawls the link the page renders after the load event', async () => {
    const unsettled: string[] = [];

    const result = await crawl({
      startUrl: `${BASE_URL}/spa-fixture.html`,
      allowlist: ['localhost'],
      browserLauncher: playwrightBrowserLauncher,
      settle: { busySelectors: BUSY_SELECTORS, onUnsettled: (url) => unsettled.push(url) },
    });

    expect(result.routeMap.routes.map((route) => route.url)).toEqual([
      `${BASE_URL}/spa-fixture.html`,
      `${BASE_URL}/spa-fixture-detail.html`,
    ]);
    expect(unsettled).toEqual([]);
  }, 60_000);

  it('analyzes the elements the page renders after the load event', async () => {
    const { pageModelSet } = await analyzePages({
      urls: [`${BASE_URL}/spa-fixture.html`],
      allowlist: ['localhost'],
      baseUrl: `${BASE_URL}/`,
      browserLauncher: playwrightBrowserLauncher,
      testIdAttribute: 'data-testid',
      settle: { busySelectors: BUSY_SELECTORS },
    });

    const testIds = pageModelSet.pages.flatMap((page) => page.interactiveElements.map((el) => el.testId));
    expect(testIds).toContain('spa-save');
  }, 60_000);

  it('gives up on a page whose busy indicator never leaves, reports it and still reads the page', async () => {
    const unsettled: string[] = [];
    const url = `${BASE_URL}/spa-fixture.html?hold=1`;

    const { pageModelSet } = await analyzePages({
      urls: [url],
      allowlist: ['localhost'],
      baseUrl: `${BASE_URL}/`,
      browserLauncher: playwrightBrowserLauncher,
      testIdAttribute: 'data-testid',
      settle: { busySelectors: BUSY_SELECTORS, timeoutMs: 1_500, onUnsettled: (u) => unsettled.push(u) },
    });

    expect(unsettled).toEqual([url]);
    expect(pageModelSet.pages).toHaveLength(1);
  }, 60_000);
});
