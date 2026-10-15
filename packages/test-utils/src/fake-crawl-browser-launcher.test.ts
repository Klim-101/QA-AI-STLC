// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { createFakeCrawlBrowserLauncher, createFakeCrawlPage } from './fake-crawl-browser-launcher.js';

describe('createFakeCrawlPage', () => {
  it('records every goto() url and defaults the response to a 200', async () => {
    const page = createFakeCrawlPage();

    const response = await page.goto('https://example.com/');

    expect(response?.status()).toBe(200);
    expect(page.gotoUrls).toEqual(['https://example.com/']);
  });

  it('returns the configured response for a url, including an explicit null', async () => {
    const page = createFakeCrawlPage({ responsesByUrl: { 'https://example.com/': null } });

    await expect(page.goto('https://example.com/')).resolves.toBeNull();
  });

  it('replays configured subrequests through every registered route handler on goto()', async () => {
    const page = createFakeCrawlPage({
      subRequestsByUrl: {
        'https://example.com/': [
          { method: 'GET', url: 'https://example.com/style.css' },
          { method: 'POST', url: 'https://example.com/analytics' },
        ],
      },
    });
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

  it('resolves fill(), click() and waitForLoadState() without error', async () => {
    const page = createFakeCrawlPage();

    await expect(page.fill('input', 'x')).resolves.toBeUndefined();
    await expect(page.click('button')).resolves.toBeUndefined();
    await expect(page.press('input', 'Enter')).resolves.toBeUndefined();
    await expect(page.hover('a')).resolves.toBeUndefined();
    await expect(page.selectOption('select', [{ label: 'High' }])).resolves.toEqual([]);
    await expect(page.setChecked('#box', true)).resolves.toBeUndefined();
    await expect(page.keyboard.press('Escape')).resolves.toBeUndefined();
    await expect(page.waitForLoadState()).resolves.toBeUndefined();
  });

  it('resolves evaluate() and ariaSnapshotJSON() to undefined before any goto() call', async () => {
    const page = createFakeCrawlPage();

    await expect(page.evaluate(() => 'ignored')).resolves.toBeUndefined();
    await expect(page.ariaSnapshotJSON()).resolves.toBeUndefined();
    await expect(page.addScriptTag({ content: 'window.foo = 1;' })).resolves.toBeUndefined();
  });

  it('resolves evaluate() to the elements configured for the current url after goto()', async () => {
    const page = createFakeCrawlPage({
      elementsByUrl: { 'https://example.com/': { interactiveElements: [] } },
    });
    await page.goto('https://example.com/');

    await expect(page.evaluate(() => 'ignored')).resolves.toEqual({ interactiveElements: [] });
  });

  it('resolves evaluate() to the links configured for the current url after goto()', async () => {
    const page = createFakeCrawlPage({ linksByUrl: { 'https://example.com/': ['https://example.com/a'] } });
    await page.goto('https://example.com/');

    await expect(page.evaluate(() => 'ignored')).resolves.toEqual(['https://example.com/a']);
  });

  it('resolves ariaSnapshotJSON() to the snapshot configured for the current url', async () => {
    const page = createFakeCrawlPage({ ariaSnapshotByUrl: { 'https://example.com/': { role: 'document' } } });
    await page.goto('https://example.com/');

    await expect(page.ariaSnapshotJSON()).resolves.toEqual({ role: 'document' });
  });

  it('resolves every locator method to a count of 1 by default', async () => {
    const page = createFakeCrawlPage();

    expect(await page.getByRole('button').count()).toBe(1);
    expect(await page.getByTestId('x').count()).toBe(1);
    expect(await page.getByLabel('x').count()).toBe(1);
    expect(await page.getByPlaceholder('x').count()).toBe(1);
    expect(await page.getByText('x').count()).toBe(1);
    expect(await page.locator('x').count()).toBe(1);
  });

  it('consumes configured locatorCounts one count() call at a time, repeating the last value', async () => {
    const page = createFakeCrawlPage({ locatorCounts: [2, 0] });
    const target = page.locator('#save');

    expect(await target.count()).toBe(2);
    expect(await target.count()).toBe(0);
    expect(await target.count()).toBe(0);
  });

  it('defaults to a count of 1 when locatorCounts is configured empty', async () => {
    const page = createFakeCrawlPage({ locatorCounts: [] });

    expect(await page.locator('#save').count()).toBe(1);
  });

  it('resolves reload() to a 200 response and records setViewportSize()/viewportSize()', async () => {
    const page = createFakeCrawlPage();

    await expect(page.reload()).resolves.toEqual(expect.objectContaining({}));
    await expect(page.setViewportSize({ width: 375, height: 667 })).resolves.toBeUndefined();
    expect(page.viewportSize()).toEqual({ width: 1280, height: 720 });
  });

  it('reports about:blank until a goto(), then title and screenshot bytes', async () => {
    const page = createFakeCrawlPage();

    expect(page.url()).toBe('about:blank');
    await page.goto('https://example.com/');
    expect(page.url()).toBe('https://example.com/');
    expect(await page.title()).toBe('');
    expect((await page.screenshot()).byteLength).toBeGreaterThan(0);
  });
});

describe('createFakeCrawlPage navigation probing support', () => {
  const PAGE = 'https://example.com/';

  it('records init scripts', async () => {
    const page = createFakeCrawlPage();

    await expect(page.addInitScript({ content: 'window.x = 1;' })).resolves.toBeUndefined();

    expect(page.initScripts).toEqual(['window.x = 1;']);
  });

  it('answers the route-discovery page functions by name, and nothing before a goto()', async () => {
    const page = createFakeCrawlPage({
      routeAttributeValuesByUrl: { [PAGE]: ['/a'] },
      historyUrlsByUrl: { [PAGE]: ['https://example.com/b'] },
      probeControlIndexesByUrl: { [PAGE]: [1] },
    });
    function readRouteAttributeValues(): undefined {
      return undefined;
    }
    function readCapturedHistoryUrls(): undefined {
      return undefined;
    }
    function listProbeControlIndexes(): undefined {
      return undefined;
    }

    await expect(page.evaluate(readRouteAttributeValues)).resolves.toBeUndefined();
    await page.goto(PAGE);

    await expect(page.evaluate(readRouteAttributeValues)).resolves.toEqual(['/a']);
    await expect(page.evaluate(readCapturedHistoryUrls)).resolves.toEqual(['https://example.com/b']);
    await expect(page.evaluate(listProbeControlIndexes)).resolves.toEqual([1]);
  });

  it('navigates, fails or stays put on a click according to the scripted result for the control', async () => {
    const page = createFakeCrawlPage({
      clickResultsByUrl: {
        [PAGE]: {
          0: {
            url: 'https://example.com/next',
            subRequests: [{ method: 'POST', url: 'https://example.com/x' }],
          },
          1: {},
          2: { error: 'not visible' },
        },
      },
    });
    const seen: string[] = [];
    await page.route('**/*', (route) => {
      seen.push(route.request().method());
    });

    await page.click('button >> nth=0');
    expect(page.url()).toBe('about:blank');

    await page.goto(PAGE);
    await page.click('button >> nth=7');
    await page.click('button >> nth=1');
    expect(page.url()).toBe(PAGE);
    await expect(page.click('button >> nth=2')).rejects.toThrow('not visible');
    await page.click('button >> nth=0');

    expect(page.url()).toBe('https://example.com/next');
    expect(seen).toEqual(['POST']);
    expect(page.clickedSelectors).toHaveLength(5);
  });
});

describe('createFakeCrawlPage collapsed panel support', () => {
  function clickCollapsedControls(): number {
    return 0;
  }

  it('plays the scripted rounds of opening collapsed panels in order, then finds none', async () => {
    const page = createFakeCrawlPage({ revealRoundsByUrl: { 'https://example.com/': [2, 1] } });
    await page.goto('https://example.com/');

    expect(await page.evaluate(clickCollapsedControls)).toBe(2);
    expect(await page.evaluate(clickCollapsedControls)).toBe(1);
    expect(await page.evaluate(clickCollapsedControls)).toBe(0);
  });

  it('rejects the way a page does when a click navigated and destroyed its script context', async () => {
    const page = createFakeCrawlPage({
      revealRoundsByUrl: { 'https://example.com/': ['context-destroyed'] },
    });
    await page.goto('https://example.com/');

    await expect(page.evaluate(clickCollapsedControls)).rejects.toThrow('Execution context was destroyed');
  });

  it('navigates the page when a round says the click led elsewhere', async () => {
    const page = createFakeCrawlPage({
      revealRoundsByUrl: { 'https://example.com/': [{ navigatesTo: 'https://example.com/next' }] },
    });
    await page.goto('https://example.com/');

    expect(await page.evaluate(clickCollapsedControls)).toBe(1);
    expect(page.url()).toBe('https://example.com/next');
  });
});

describe('createFakeCrawlBrowserLauncher', () => {
  it("replays requests of the crawl's own page through its context route", async () => {
    const launcher = createFakeCrawlBrowserLauncher({
      subRequestsByUrl: { 'https://example.com/': [{ method: 'POST', url: 'https://example.com/x' }] },
    });
    const context = await (await launcher.launch()).newContext();
    const seen: string[] = [];
    await context.route('**/*', (route) => {
      seen.push(route.request().method());
    });

    await (await context.newPage()).goto('https://example.com/');

    expect(seen).toEqual(['POST']);
  });

  it('hands each later context a page of its own, replays requests through its context route, and counts closes', async () => {
    const launcher = createFakeCrawlBrowserLauncher({
      clickResultsByUrl: {
        'https://example.com/': { 0: { subRequests: [{ method: 'POST', url: 'https://example.com/x' }] } },
      },
    });
    const browser = await launcher.launch();
    const first = await (await browser.newContext()).newPage();
    const probeContext = await browser.newContext();
    const probePage = await probeContext.newPage();
    const seen: string[] = [];
    await probeContext.route('**/*', (route) => {
      seen.push(route.request().method());
    });

    await probePage.goto('https://example.com/');
    await probePage.click('button >> nth=0');
    await probeContext.close();

    expect(first).toBe(launcher.page);
    expect(probePage).not.toBe(launcher.page);
    expect(launcher.pages).toEqual([launcher.page, probePage]);
    expect(seen).toEqual(['POST']);
    expect(launcher.closedContexts).toBe(1);
    expect(probeContext.on('page', () => undefined)).toBeUndefined();
  });

  it('exposes a closable context through launch() and contexts(), tracking close()', async () => {
    const launcher = createFakeCrawlBrowserLauncher();

    const browser = await launcher.launch();
    const context = await browser.newContext();

    expect(browser.contexts()).toEqual([context]);
    await expect(context.newPage()).resolves.toBe(launcher.page);
    expect(context.pages()).toEqual([launcher.page]);
    await expect(context.storageState()).resolves.toEqual({ cookies: [], origins: [] });
    await expect(context.close()).resolves.toBeUndefined();
    await browser.close();
    expect(launcher.closedBrowsers).toBe(1);
  });

  it('records the options passed to newContext(), defaulting to an empty object', async () => {
    const launcher = createFakeCrawlBrowserLauncher();
    const browser = await launcher.launch();
    const storageState = { cookies: [], origins: [] };

    await browser.newContext();
    await browser.newContext({ storageState });

    expect(launcher.newContextCalls).toEqual([{}, { storageState }]);
  });

  it('rejects newContext() and tracks close() on a browser obtained through connectOverCdp', async () => {
    const storageState = { cookies: [], origins: [] };
    const launcher = createFakeCrawlBrowserLauncher({ authStorageState: storageState });

    const browser = await launcher.connectOverCdp('http://localhost:9222');
    const [context] = browser.contexts();

    await expect(browser.newContext()).rejects.toThrow('newContext is not available');
    await expect(context?.storageState()).resolves.toEqual(storageState);
    await expect(context?.newPage()).resolves.toBe(launcher.page);
    expect(context?.pages()).toEqual([launcher.page]);
    await expect(context?.close()).resolves.toBeUndefined();
    await browser.close();
    expect(launcher.closedBrowsers).toBe(1);
  });

  it('defaults connectOverCdp storageState to an empty session when none is configured', async () => {
    const launcher = createFakeCrawlBrowserLauncher();

    const browser = await launcher.connectOverCdp('http://localhost:9222');
    const [context] = browser.contexts();

    await expect(context?.storageState()).resolves.toEqual({ cookies: [], origins: [] });
  });

  it('accepts event listeners, close() and bringToFront() on its page, and route()/on() on its contexts', async () => {
    const launcher = createFakeCrawlBrowserLauncher();
    const browser = await launcher.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    expect(page.on('dialog', () => undefined)).toBeUndefined();
    expect(page.on('close', () => undefined)).toBeUndefined();
    await expect(page.close()).resolves.toBeUndefined();
    await expect(page.bringToFront()).resolves.toBeUndefined();
    await expect(context.route('**/*', () => undefined)).resolves.toBeUndefined();
    expect(context.on('page', () => undefined)).toBeUndefined();

    const [attached] = (await launcher.connectOverCdp('http://localhost:9222')).contexts();
    await expect(attached?.route('**/*', () => undefined)).resolves.toBeUndefined();
    expect(attached?.on('page', () => undefined)).toBeUndefined();
  });

  it('records setInputFiles() on its page', async () => {
    const launcher = createFakeCrawlBrowserLauncher();
    const page = await (await (await launcher.launch()).newContext()).newPage();

    await expect(
      page.setInputFiles('#file', [{ name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('a') }]),
    ).resolves.toBeUndefined();
  });
});
