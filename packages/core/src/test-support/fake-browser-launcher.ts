// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type {
  AuthBrowser,
  AuthBrowserContext,
  AuthPage,
  BrowserLauncher,
  NewContextOptions,
  PageLocator,
  PageResponse,
  StorageState,
  ViewportSize,
} from '../ports/browser-launcher.js';

const EMPTY_STORAGE_STATE: StorageState = { cookies: [], origins: [] };

export interface FakePageCall {
  readonly method:
    | 'goto'
    | 'fill'
    | 'click'
    | 'waitForLoadState'
    | 'route'
    | 'evaluate'
    | 'ariaSnapshotJSON'
    | 'getByRole'
    | 'getByTestId'
    | 'getByLabel'
    | 'getByPlaceholder'
    | 'getByText'
    | 'locator'
    | 'reload'
    | 'setViewportSize';
  readonly args: readonly unknown[];
}

export interface FakeBrowserLauncherOptions {
  readonly storageState?: StorageState;
  readonly contexts?: readonly AuthBrowserContext[];
  /** Returned by every `page.goto()` call; defaults to a 200 response. */
  readonly gotoResponse?: PageResponse | null;
  /** Returned by every `page.reload()` call; defaults to a 200 response. */
  readonly reloadResponse?: PageResponse | null;
  /** Returned by every `page.evaluate()` call; defaults to `undefined`. */
  readonly evaluateResult?: unknown;
  /** Returned by every `page.ariaSnapshotJSON()` call; defaults to `undefined`. */
  readonly ariaSnapshotResult?: unknown;
  /**
   * Consumed one at a time, in order, by successive `PageLocator.count()` calls across every
   * `getBy*`/`locator()` locator this fake page hands out; the last value repeats once exhausted.
   * Defaults to always resolving to exactly one match.
   */
  readonly locatorCounts?: readonly number[];
  /** Returned by `page.viewportSize()`; defaults to a 1280x720 desktop size. */
  readonly viewportSize?: ViewportSize | null;
}

export interface FakeBrowserLauncher extends BrowserLauncher {
  readonly pageCalls: FakePageCall[];
  readonly closedBrowsers: number;
  readonly newContextCalls: NewContextOptions[];
}

const DEFAULT_GOTO_RESPONSE: PageResponse = { status: () => 200 };
const DEFAULT_VIEWPORT_SIZE: ViewportSize = { width: 1280, height: 720 };

function createFakePage(calls: FakePageCall[], options: FakeBrowserLauncherOptions): AuthPage {
  // `??` would also replace an explicitly configured `null` (a deliberately failed navigation),
  // so presence is checked instead of nullishness.
  const gotoResponse = 'gotoResponse' in options ? options.gotoResponse : DEFAULT_GOTO_RESPONSE;
  const reloadResponse = 'reloadResponse' in options ? options.reloadResponse : DEFAULT_GOTO_RESPONSE;
  const locatorCounts = options.locatorCounts ?? [1];
  let locatorCallIndex = 0;

  function nextLocatorCount(): number {
    const index = Math.min(locatorCallIndex, locatorCounts.length - 1);
    locatorCallIndex += 1;
    return locatorCounts[index] ?? 1;
  }

  function fakeLocator(method: FakePageCall['method'], args: readonly unknown[]): PageLocator {
    calls.push({ method, args });
    return { count: () => Promise.resolve(nextLocatorCount()) };
  }

  return {
    goto: (...args) => {
      calls.push({ method: 'goto', args });
      return Promise.resolve(gotoResponse);
    },
    fill: (...args) => {
      calls.push({ method: 'fill', args });
      return Promise.resolve();
    },
    click: (...args) => {
      calls.push({ method: 'click', args });
      return Promise.resolve();
    },
    waitForLoadState: (...args) => {
      calls.push({ method: 'waitForLoadState', args });
      return Promise.resolve();
    },
    route: (...args) => {
      calls.push({ method: 'route', args });
      return Promise.resolve();
    },
    evaluate: (...args) => {
      calls.push({ method: 'evaluate', args });
      return Promise.resolve(options.evaluateResult);
    },
    ariaSnapshotJSON: (...args) => {
      calls.push({ method: 'ariaSnapshotJSON', args });
      return Promise.resolve(options.ariaSnapshotResult);
    },
    getByRole: (...args) => fakeLocator('getByRole', args),
    getByTestId: (...args) => fakeLocator('getByTestId', args),
    getByLabel: (...args) => fakeLocator('getByLabel', args),
    getByPlaceholder: (...args) => fakeLocator('getByPlaceholder', args),
    getByText: (...args) => fakeLocator('getByText', args),
    locator: (...args) => fakeLocator('locator', args),
    reload: (...args) => {
      calls.push({ method: 'reload', args });
      return Promise.resolve(reloadResponse);
    },
    setViewportSize: (...args) => {
      calls.push({ method: 'setViewportSize', args });
      return Promise.resolve();
    },
    viewportSize: () => ('viewportSize' in options ? (options.viewportSize ?? null) : DEFAULT_VIEWPORT_SIZE),
  };
}

/** A fake `BrowserLauncher` for unit tests: no real browser is ever launched (AGENTS.md 5.3, 13). */
export function createFakeBrowserLauncher(options: FakeBrowserLauncherOptions = {}): FakeBrowserLauncher {
  const pageCalls: FakePageCall[] = [];
  const newContextCalls: NewContextOptions[] = [];
  let closedBrowsers = 0;
  const storageState = options.storageState ?? EMPTY_STORAGE_STATE;

  const launcher: FakeBrowserLauncher = {
    pageCalls,
    newContextCalls,
    get closedBrowsers() {
      return closedBrowsers;
    },
    launch: () => {
      const context: AuthBrowserContext = {
        newPage: () => Promise.resolve(createFakePage(pageCalls, options)),
        storageState: () => Promise.resolve(storageState),
        close: () => Promise.resolve(),
      };
      const browser: AuthBrowser = {
        newContext: (newContextOptions = {}) => {
          newContextCalls.push(newContextOptions);
          return Promise.resolve(context);
        },
        contexts: () => [context],
        close: () => {
          closedBrowsers += 1;
          return Promise.resolve();
        },
      };
      return Promise.resolve(browser);
    },
    connectOverCdp: () => {
      const browser: AuthBrowser = {
        newContext: () =>
          Promise.reject(new Error('newContext is not available on an attached browser in this fake')),
        contexts: () => options.contexts ?? [],
        close: () => {
          closedBrowsers += 1;
          return Promise.resolve();
        },
      };
      return Promise.resolve(browser);
    },
  };
  return launcher;
}
