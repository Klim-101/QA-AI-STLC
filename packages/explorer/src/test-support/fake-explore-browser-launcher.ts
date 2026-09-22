// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type {
  AuthBrowser,
  AuthBrowserContext,
  AuthPage,
  BrowserLauncher,
  LaunchOptions,
  PageLocator,
  PageResponse,
  PageRoute,
  RouteHandler,
  StorageState,
} from '@qa-ai-stlc/core';

const EMPTY_STORAGE_STATE: StorageState = { cookies: [], origins: [] };
const DEFAULT_RESPONSE: PageResponse = { status: () => 200 };
// Not a real PNG: no code path under test decodes a screenshot, it only has to be bytes.
const PLACEHOLDER_SCREENSHOT_BYTES = new TextEncoder().encode('fake-screenshot');

export interface FakeSubRequest {
  readonly method: string;
  readonly url: string;
}

function createFakeRoute(method: string, url: string): PageRoute {
  return {
    request: () => ({ method: () => method, url: () => url }),
    abort: () => Promise.resolve(),
    continue: () => Promise.resolve(),
  };
}

export interface FakeExplorePageOptions {
  /** Maps a normalized URL to the `<a href>` targets `extractLinks()` should see on it. */
  readonly linksByUrl?: Readonly<Record<string, readonly string[]>>;
  /** Maps a normalized URL to the raw page-elements `extractPageElements()` should see on it. */
  readonly elementsByUrl?: Readonly<Record<string, unknown>>;
  /** The count every `getByRole()`/`getByTestId()`/.../`locator()` call resolves to. */
  readonly locatorCount?: number;
  /** The overlay state `readPickModeState()` sees on every poll, once pick mode is injected. */
  readonly pickModeState?: { readonly done: boolean; readonly captures: readonly unknown[] };
  /** Simulates the subrequests a real page fires through the registered route handler on visit. */
  readonly subRequestsByUrl?: Readonly<Record<string, readonly FakeSubRequest[]>>;
}

/**
 * A fake `AuthPage` for `runExplore` operation tests: no real browser or network call (AGENTS.md
 * 5.3, 13). Distinguishes an `extractLinks()` call from an `extractPageElements()` call by which
 * option was configured for the current URL, and a pick-mode overlay poll by `pickModeState`
 * being set — `injectPickModeOverlay()`'s own `evaluate()` call discards whatever it returns, so
 * returning the same state for it too is harmless.
 */
export function createFakeExplorePage(options: FakeExplorePageOptions = {}): AuthPage {
  let currentUrl: string | undefined;
  const routeHandlers: RouteHandler[] = [];
  const locatorMethod = (): PageLocator => ({ count: () => Promise.resolve(options.locatorCount ?? 1) });

  return {
    goto: async (url) => {
      currentUrl = url;
      for (const subRequest of options.subRequestsByUrl?.[url] ?? []) {
        for (const handler of routeHandlers) {
          await handler(createFakeRoute(subRequest.method, subRequest.url));
        }
      }
      return DEFAULT_RESPONSE;
    },
    fill: () => Promise.resolve(),
    click: () => Promise.resolve(),
    waitForLoadState: () => Promise.resolve(),
    route: (_pattern, handler) => {
      routeHandlers.push(handler);
      return Promise.resolve();
    },
    evaluate: () => {
      if (options.pickModeState !== undefined) {
        return Promise.resolve(options.pickModeState);
      }
      if (currentUrl === undefined) {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(options.elementsByUrl?.[currentUrl] ?? options.linksByUrl?.[currentUrl] ?? []);
    },
    ariaSnapshotJSON: () => Promise.resolve({ role: 'document' }),
    getByRole: locatorMethod,
    getByTestId: locatorMethod,
    getByLabel: locatorMethod,
    getByPlaceholder: locatorMethod,
    getByText: locatorMethod,
    locator: locatorMethod,
    reload: () => Promise.resolve(DEFAULT_RESPONSE),
    setViewportSize: () => Promise.resolve(),
    viewportSize: () => null,
    url: () => currentUrl ?? 'about:blank',
    title: () => Promise.resolve(''),
    screenshot: () => Promise.resolve(PLACEHOLDER_SCREENSHOT_BYTES),
  };
}

export interface FakeExploreBrowserLauncherOptions extends FakeExplorePageOptions {
  readonly authStorageState?: StorageState;
}

export interface FakeExploreBrowserLauncher extends BrowserLauncher {
  readonly page: AuthPage;
  readonly closedBrowsers: { count: number };
  /** Every `options` a caller passed to `launch()`, in call order — asserts headed vs headless. */
  readonly launchCalls: LaunchOptions[];
}

/** A fake `BrowserLauncher` for `runExplore` operation tests (AGENTS.md 5.3, 13). */
export function createFakeExploreBrowserLauncher(
  options: FakeExploreBrowserLauncherOptions = {},
): FakeExploreBrowserLauncher {
  const page = createFakeExplorePage(options);
  const closedBrowsers = { count: 0 };
  const launchCalls: LaunchOptions[] = [];

  const context: AuthBrowserContext = {
    newPage: () => Promise.resolve(page),
    storageState: () => Promise.resolve(EMPTY_STORAGE_STATE),
    close: () => Promise.resolve(),
  };

  return {
    page,
    closedBrowsers,
    launchCalls,
    launch: (launchOptions = {}) => {
      launchCalls.push(launchOptions);
      const browser: AuthBrowser = {
        newContext: () => Promise.resolve(context),
        contexts: () => [context],
        close: () => {
          closedBrowsers.count += 1;
          return Promise.resolve();
        },
      };
      return Promise.resolve(browser);
    },
    connectOverCdp: () => {
      const authContext: AuthBrowserContext = {
        newPage: () => Promise.resolve(page),
        storageState: () => Promise.resolve(options.authStorageState ?? EMPTY_STORAGE_STATE),
        close: () => Promise.resolve(),
      };
      const browser: AuthBrowser = {
        newContext: () => Promise.reject(new Error('newContext is not available on an attached browser')),
        contexts: () => [authContext],
        close: () => {
          closedBrowsers.count += 1;
          return Promise.resolve();
        },
      };
      return Promise.resolve(browser);
    },
  };
}
