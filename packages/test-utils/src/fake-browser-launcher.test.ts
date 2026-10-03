// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { createFakeBrowserLauncher, evaluateNothing } from './fake-browser-launcher.js';

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

  it('resolves storageState() and tracks close() on a browser obtained through launch()', async () => {
    const storageState = { cookies: [], origins: [] };
    const launcher = createFakeBrowserLauncher({ storageState });
    const browser = await launcher.launch();
    const context = await browser.newContext();

    await expect(context.storageState()).resolves.toEqual(storageState);
    await browser.close();
    expect(launcher.closedBrowsers).toBe(1);
  });

  it('rejects the clicks its outcomes list names, in order, then resolves', async () => {
    const failure = new Error('element is not visible');
    const launcher = createFakeBrowserLauncher({ clickOutcomes: [undefined, failure] });
    const browser = await launcher.launch();
    const page = await (await browser.newContext()).newPage();

    await expect(page.click('a')).resolves.toBeUndefined();
    await expect(page.click('b')).rejects.toBe(failure);
    await expect(page.click('c')).resolves.toBeUndefined();
    expect(launcher.pageCalls.map((call) => call.args[0])).toEqual(['a', 'b', 'c']);
  });

  it('resolves fill(), click() and waitForLoadState() calls, recording each', async () => {
    const launcher = createFakeBrowserLauncher();
    const page = await (await (await launcher.launch()).newContext()).newPage();

    await expect(page.fill('input', 'x')).resolves.toBeUndefined();
    await expect(page.click('button')).resolves.toBeUndefined();
    await expect(page.waitForLoadState()).resolves.toBeUndefined();

    expect(launcher.pageCalls.map((call) => call.method)).toEqual(['fill', 'click', 'waitForLoadState']);
  });

  it('resolves press(), hover(), setChecked() and keyboard.press(), recording each', async () => {
    const launcher = createFakeBrowserLauncher();
    const page = await (await (await launcher.launch()).newContext()).newPage();

    await expect(page.press('input', 'Enter')).resolves.toBeUndefined();
    await expect(page.hover('a')).resolves.toBeUndefined();
    await expect(page.setChecked('#box', true)).resolves.toBeUndefined();
    await expect(page.selectOption('select', [{ label: 'High' }])).resolves.toEqual([]);
    await expect(page.keyboard.press('Escape')).resolves.toBeUndefined();

    expect(launcher.pageCalls).toEqual([
      { method: 'press', args: ['input', 'Enter'] },
      { method: 'hover', args: ['a'] },
      { method: 'setChecked', args: ['#box', true] },
      { method: 'selectOption', args: ['select', [{ label: 'High' }]] },
      { method: 'keyboardPress', args: ['Escape'] },
    ]);
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

  it('defaults goto() to a 200 response and records route()/evaluate() calls', async () => {
    const launcher = createFakeBrowserLauncher();
    const browser = await launcher.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    const response = await page.goto('https://example.com');
    await page.route('**/*', () => undefined);
    const evaluated = await page.evaluate(() => 'ignored');
    const snapshot = await page.ariaSnapshotJSON();
    const scriptTagResult = await page.addScriptTag({ content: 'window.foo = 1;' });

    expect(response?.status()).toBe(200);
    expect(evaluated).toBeUndefined();
    expect(snapshot).toBeUndefined();
    expect(scriptTagResult).toBeUndefined();
    expect(launcher.pageCalls.map((call) => call.method)).toEqual([
      'goto',
      'route',
      'evaluate',
      'ariaSnapshotJSON',
      'addScriptTag',
    ]);
  });

  it('answers locator().evaluate() with nothing unless a handler is scripted', async () => {
    const launcher = createFakeBrowserLauncher();
    const page = await (await (await launcher.launch()).newContext()).newPage();

    await expect(page.locator('#x').evaluate(() => 'ignored', undefined)).resolves.toBeUndefined();
    await expect(evaluateNothing()).resolves.toBeUndefined();
  });

  it('answers locator(selector).evaluate() through the scripted handler and records the call', async () => {
    const launcher = createFakeBrowserLauncher({
      locatorEvaluate: ({ selector, functionName, arg }) =>
        `${String(selector)}|${functionName}|${String(arg)}`,
    });
    const page = await (await (await launcher.launch()).newContext()).newPage();

    const answer = await page.locator('#x').evaluate(
      function readThing() {
        return undefined;
      },
      'arg',
      { timeout: 5 },
    );

    expect(answer).toBe('#x|readThing|arg');
    expect(launcher.pageCalls.at(-1)).toEqual({
      method: 'locatorEvaluate',
      args: ['#x', 'readThing', 'arg', { timeout: 5 }],
    });
  });

  it('returns the configured gotoResponse, evaluateResult and ariaSnapshotResult', async () => {
    const launcher = createFakeBrowserLauncher({
      gotoResponse: { status: () => 404 },
      evaluateResult: ['https://example.com/a'],
      ariaSnapshotResult: { role: 'document' },
    });
    const browser = await launcher.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    const response = await page.goto('https://example.com/missing');
    const evaluated = await page.evaluate(() => []);
    const snapshot = await page.ariaSnapshotJSON();

    expect(response?.status()).toBe(404);
    expect(evaluated).toEqual(['https://example.com/a']);
    expect(snapshot).toEqual({ role: 'document' });
  });

  it('honors an explicitly configured null gotoResponse', async () => {
    const launcher = createFakeBrowserLauncher({ gotoResponse: null });
    const browser = await launcher.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    await expect(page.goto('https://example.com')).resolves.toBeNull();
  });

  it('defaults reload() to a 200 response and honors an explicitly configured null', async () => {
    const launcher = createFakeBrowserLauncher();
    const page = await (await (await launcher.launch()).newContext()).newPage();

    const response = await page.reload();

    expect(response?.status()).toBe(200);

    const nullLauncher = createFakeBrowserLauncher({ reloadResponse: null });
    const nullPage = await (await (await nullLauncher.launch()).newContext()).newPage();
    await expect(nullPage.reload()).resolves.toBeNull();
  });

  it('records setViewportSize() calls', async () => {
    const launcher = createFakeBrowserLauncher();
    const page = await (await (await launcher.launch()).newContext()).newPage();

    await page.setViewportSize({ width: 375, height: 667 });

    expect(launcher.pageCalls).toEqual([{ method: 'setViewportSize', args: [{ width: 375, height: 667 }] }]);
  });

  it('records every locator method and each resolves to exactly one match by default', async () => {
    const launcher = createFakeBrowserLauncher();
    const page = await (await (await launcher.launch()).newContext()).newPage();

    expect(await page.getByRole('button', { name: 'Save' }).count()).toBe(1);
    expect(await page.getByTestId('save-button').count()).toBe(1);
    expect(await page.getByLabel('Email').count()).toBe(1);
    expect(await page.getByPlaceholder('you@example.com').count()).toBe(1);
    expect(await page.getByText('Save').count()).toBe(1);
    expect(await page.locator('#save').count()).toBe(1);

    expect(launcher.pageCalls.map((call) => call.method)).toEqual([
      'getByRole',
      'getByTestId',
      'getByLabel',
      'getByPlaceholder',
      'getByText',
      'locator',
    ]);
  });

  it('defaults viewportSize() to 1280x720 and honors a configured value, including null', async () => {
    const defaultPage = await (await (await createFakeBrowserLauncher().launch()).newContext()).newPage();
    expect(defaultPage.viewportSize()).toEqual({ width: 1280, height: 720 });

    const customLauncher = createFakeBrowserLauncher({ viewportSize: { width: 375, height: 667 } });
    const customPage = await (await (await customLauncher.launch()).newContext()).newPage();
    expect(customPage.viewportSize()).toEqual({ width: 375, height: 667 });

    const nullLauncher = createFakeBrowserLauncher({ viewportSize: null });
    const nullPage = await (await (await nullLauncher.launch()).newContext()).newPage();
    expect(nullPage.viewportSize()).toBeNull();
  });

  it('consumes configured locatorCounts one count() call at a time, repeating the last value', async () => {
    const launcher = createFakeBrowserLauncher({ locatorCounts: [1, 0] });
    const page = await (await (await launcher.launch()).newContext()).newPage();
    const target = page.locator('#save');

    expect(await target.count()).toBe(1);
    expect(await target.count()).toBe(0);
    expect(await target.count()).toBe(0);
  });

  it('defaults to a count of 1 when locatorCounts is configured empty', async () => {
    const launcher = createFakeBrowserLauncher({ locatorCounts: [] });
    const page = await (await (await launcher.launch()).newContext()).newPage();

    expect(await page.locator('#save').count()).toBe(1);
  });

  it('reports about:blank until a goto, then the URL it was sent to', async () => {
    const launcher = createFakeBrowserLauncher();
    const page = await (await (await launcher.launch()).newContext()).newPage();

    expect(page.url()).toBe('about:blank');
    await page.goto('https://example.com/a');
    expect(page.url()).toBe('https://example.com/a');

    const seededLauncher = createFakeBrowserLauncher({ initialUrl: 'https://example.com/start' });
    const seededPage = await (await (await seededLauncher.launch()).newContext()).newPage();
    expect(seededPage.url()).toBe('https://example.com/start');
  });

  it('defaults title() to empty and screenshot() to placeholder bytes, recording both', async () => {
    const launcher = createFakeBrowserLauncher();
    const page = await (await (await launcher.launch()).newContext()).newPage();

    expect(await page.title()).toBe('');
    expect(await page.screenshot()).toEqual(new TextEncoder().encode('fake-screenshot'));
    expect(launcher.pageCalls.map((call) => call.method)).toEqual(['title', 'screenshot']);
  });

  it('returns the configured title and screenshot bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const launcher = createFakeBrowserLauncher({ title: 'Home', screenshotBytes: bytes });
    const page = await (await (await launcher.launch()).newContext()).newPage();

    expect(await page.title()).toBe('Home');
    expect(await page.screenshot({ fullPage: true })).toEqual(bytes);
  });

  it('records the options passed to newContext(), defaulting to an empty object', async () => {
    const launcher = createFakeBrowserLauncher();
    const browser = await launcher.launch();
    const storageState = { cookies: [], origins: [] };

    await browser.newContext();
    await browser.newContext({ storageState });

    expect(launcher.newContextCalls).toEqual([{}, { storageState }]);
  });

  it('raises a dialog on a page and records what the engine did with it', async () => {
    const launcher = createFakeBrowserLauncher();
    const page = await (await (await launcher.launch()).newContext()).newPage();
    page.on('dialog', (dialog) => {
      expect(dialog.message()).toBe('Sure?');
      void dialog.dismiss();
    });
    page.on('dialog', (dialog) => {
      void dialog.accept();
    });

    launcher.raiseDialog('confirm', 'Sure?');

    expect(launcher.dialogOutcomes).toEqual([
      { type: 'confirm', message: 'Sure?', action: 'dismissed' },
      { type: 'confirm', message: 'Sure?', action: 'accepted' },
    ]);
    expect(launcher.pages).toEqual([page]);
  });

  it('raises a dialog on the page it is asked to, and on none that does not exist', async () => {
    const launcher = createFakeBrowserLauncher();
    const context = await (await launcher.launch()).newContext();
    await context.newPage();
    const popup = launcher.openPopup('https://example.com/popup');
    const types: string[] = [];
    popup.on('dialog', (dialog) => {
      types.push(dialog.type());
    });

    launcher.raiseDialog('alert', 'first page');
    launcher.raiseDialog('prompt', 'popup', 1);
    launcher.raiseDialog('prompt', 'nobody', 5);

    expect(types).toEqual(['prompt']);
  });

  it('opens a popup at a URL, hands it to the context page listeners and counts it as a page', async () => {
    const launcher = createFakeBrowserLauncher();
    const context = await (await launcher.launch()).newContext();
    const opened: string[] = [];
    context.on('page', (page) => {
      opened.push(page.url());
    });

    const popup = launcher.openPopup('https://example.com/popup');

    expect(opened).toEqual(['https://example.com/popup']);
    expect(launcher.pages).toEqual([popup]);
    expect(popup.url()).toBe('https://example.com/popup');
  });

  it('closes a page, runs its close listeners and records it, and brings a page to the front', async () => {
    const launcher = createFakeBrowserLauncher();
    const page = await (await (await launcher.launch()).newContext()).newPage();
    let closeEvents = 0;
    page.on('close', () => {
      closeEvents += 1;
    });

    await page.bringToFront();
    await page.close();

    expect(closeEvents).toBe(1);
    expect(launcher.closedPages).toEqual([page]);
    expect(launcher.pageCalls.map((call) => call.method)).toEqual(['bringToFront', 'close']);
  });

  it('records a context-level route separately from a page-level one', async () => {
    const launcher = createFakeBrowserLauncher();
    const context = await (await launcher.launch()).newContext();
    const handler = (): undefined => undefined;

    await context.route('**/*', handler);

    expect(launcher.pageCalls).toEqual([{ method: 'contextRoute', args: ['**/*', handler] }]);
  });

  it('fails dialogs, dialog messages, closing and load-state waits when told to', async () => {
    const launcher = createFakeBrowserLauncher();
    const page = await (await (await launcher.launch()).newContext()).newPage();
    const results: string[] = [];
    page.on('dialog', (dialog) => {
      try {
        results.push(dialog.message());
      } catch (error) {
        results.push(String(error));
      }
      dialog.dismiss().catch((error: unknown) => results.push(String(error)));
    });

    launcher.failDialogsWith('gone');
    launcher.breakDialogMessages('broken');
    launcher.failClosingWith('stuck');
    launcher.failLoadStateWith('slow');
    launcher.raiseDialog('alert', 'x');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(results).toEqual(['broken', 'gone']);
    await expect(page.close()).rejects.toBe('stuck');
    await expect(page.waitForLoadState()).rejects.toBe('slow');
    expect(launcher.closedPages).toEqual([]);
  });

  it('records setInputFiles() on its page', async () => {
    const launcher = createFakeBrowserLauncher();
    const page = await (await (await launcher.launch()).newContext()).newPage();

    await expect(
      page.setInputFiles('#file', [{ name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('a') }]),
    ).resolves.toBeUndefined();
    expect(launcher.pageCalls.map((call) => call.method)).toEqual(['setInputFiles']);
  });

  it('raises console messages, page errors, responses and failed requests on a page', async () => {
    const launcher = createFakeBrowserLauncher();
    const page = await (await (await launcher.launch()).newContext()).newPage();
    const seen: string[] = [];
    page.on('console', (message) => {
      seen.push(`console ${message.type()} ${message.text()}`);
    });
    page.on('pageerror', (error) => {
      seen.push(`pageerror ${error.message}`);
    });
    page.on('response', (response) => {
      seen.push(`response ${response.request().method()} ${response.url()} ${String(response.status())}`);
    });
    page.on('requestfailed', (request) => {
      seen.push(`failed ${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'none'}`);
    });

    launcher.raiseConsole('error', 'boom');
    launcher.raisePageError('thrown');
    launcher.raiseResponse({ method: 'GET', url: 'https://example.com/a', status: 404 });
    launcher.raiseRequestFailed({
      method: 'POST',
      url: 'https://example.com/b',
      errorText: 'net::ERR_FAILED',
    });
    launcher.raiseRequestFailed({ method: 'GET', url: 'https://example.com/c' });
    launcher.raiseConsole('log', 'nobody listens', 4);

    expect(seen).toEqual([
      'console error boom',
      'pageerror thrown',
      'response GET https://example.com/a 404',
      'failed POST https://example.com/b net::ERR_FAILED',
      'failed GET https://example.com/c none',
    ]);
  });

  it('closes a page nobody listens to', async () => {
    const launcher = createFakeBrowserLauncher();
    const page = await (await (await launcher.launch()).newContext()).newPage();

    await expect(page.close()).resolves.toBeUndefined();

    expect(launcher.closedPages).toEqual([page]);
  });
});
