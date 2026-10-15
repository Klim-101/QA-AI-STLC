// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { playwrightBrowserLauncher } from '@qa-ai-stlc/core';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyzePages } from '../src/analyze-pages.js';
import { buildSelectorRegistry } from '../src/build-selector-registry.js';
import { crawl } from '../src/crawl.js';
import { revealCollapsedPanels } from '../src/reveal-collapsed-panels.js';
import { settlePage } from '../src/settle-page.js';

// A fixed port, distinct from the ports the other demo-app tests use.
const PORT = 4430;
const BASE_URL = `http://localhost:${String(PORT)}`;
const PAGE_URL = `${BASE_URL}/explore-reveal.html`;
const STARTUP_TIMEOUT_MS = 60_000;

let demoApp: ManagedServer;

beforeAll(async () => {
  demoApp = await startDemoApp(PORT);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(async () => {
  await demoApp.stop();
});

async function analyze(revealCollapsed: boolean): ReturnType<typeof analyzePages> {
  return analyzePages({
    urls: [PAGE_URL],
    allowlist: ['localhost'],
    baseUrl: `${BASE_URL}/`,
    browserLauncher: playwrightBrowserLauncher,
    testIdAttribute: 'data-testid',
    revealCollapsed,
  });
}

describe('explore a page with collapsed panels (demo app)', () => {
  it('registers a header and a chip that carry the test id, and not a plain container', async () => {
    const { pageModelSet, expandedPanelCount } = await analyze(false);

    const elements = (pageModelSet.pages[0]?.interactiveElements ?? []).filter(
      (element) => element.kind === 'element',
    );
    expect(elements.map((element) => element.testId)).toEqual(['sort-name', 'sort-status', 'chip-open']);
    expect(elements.map((element) => element.accessibleName)).toEqual(['Name', 'Status', 'Open']);
    expect(expandedPanelCount).toBe(0);
  }, 60_000);

  it('leaves the controls inside a collapsed panel out when it is not asked to open them', async () => {
    const { pageModelSet } = await analyze(false);

    const testIds = (pageModelSet.pages[0]?.interactiveElements ?? []).map((element) => element.testId);
    expect(testIds).not.toContain('filter-customer');
  }, 60_000);

  it('opens the panels, including one inside a panel, and reports how many it opened', async () => {
    const { pageModelSet, expandedPanelCount, blockedRequestCount } = await analyze(true);

    const testIds = (pageModelSet.pages[0]?.interactiveElements ?? []).map((element) => element.testId);
    expect(testIds).toEqual(expect.arrayContaining(['filter-customer', 'filter-reference']));
    expect(expandedPanelCount).toBe(2);
    expect(blockedRequestCount).toBe(0);
  }, 60_000);

  it('does not click a menu button or a control whose name says it destroys something', async () => {
    const browser = await playwrightBrowserLauncher.launch();
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(PAGE_URL);
      await settlePage(page, PAGE_URL);

      const clickedCount = await revealCollapsedPanels(page, { pageUrl: PAGE_URL });

      expect(clickedCount).toBe(2);
      expect(await page.evaluate(() => (window as unknown as { qaClicked: string[] }).qaClicked)).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 60_000);

  it('scores a control inside a panel as stable only when the panel is reopened after a reload', async () => {
    const { pageModelSet } = await analyze(true);
    const scoreOf = async (revealCollapsed: boolean): Promise<number | undefined> => {
      const { registry } = await buildSelectorRegistry({
        pageModelSet,
        allowlist: ['localhost'],
        baseUrl: `${BASE_URL}/`,
        browserLauncher: playwrightBrowserLauncher,
        revealCollapsed,
      });
      return registry.elements.find((element) => /customer/i.test(element.name ?? ''))?.stabilityScore;
    };

    expect(await scoreOf(true)).toBe(1);
    expect(await scoreOf(false)).toBe(0);
  }, 120_000);

  it('follows a role="button" control that navigates when probing navigation', async () => {
    const result = await crawl({
      startUrl: PAGE_URL,
      allowlist: ['localhost'],
      browserLauncher: playwrightBrowserLauncher,
      probeNavigation: true,
    });

    expect(result.routeMap.routes.map((route) => route.url)).toContain(
      `${BASE_URL}/spa-routes-overview.html`,
    );
  }, 60_000);
});
