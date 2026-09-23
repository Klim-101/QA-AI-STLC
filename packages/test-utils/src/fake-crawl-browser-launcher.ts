// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type {
  AuthBrowserContextLike,
  AuthBrowserLike,
  AuthPageLike,
  BrowserLauncherLike,
  NewContextOptionsLike,
  PageLocatorLike,
  PageResponseLike,
  PageRouteLike,
  RouteHandlerLike,
  StorageStateLike,
} from './fake-browser-launcher.js';

const EMPTY_STORAGE_STATE: StorageStateLike = { cookies: [], origins: [] };
const DEFAULT_RESPONSE: PageResponseLike = { status: () => 200 };

function createFakeRoute(method: string, url: string): PageRouteLike {
  return {
    request: () => ({ method: () => method, url: () => url }),
    abort: () => Promise.resolve(),
    continue: () => Promise.resolve(),
  };
}

export interface FakeSubRequest {
  readonly method: string;
  readonly url: string;
}

export interface FakeCrawlPageOptions {
  /** Maps a normalized URL to the response `goto()` resolves with for it; defaults to a 200. */
  readonly responsesByUrl?: Readonly<Record<string, PageResponseLike | null>>;
  /** Maps a normalized URL to the links `extractLinks()` should see on it. */
  readonly linksByUrl?: Readonly<Record<string, readonly string[]>>;
  /** Maps a normalized URL to the accessibility snapshot `ariaSnapshotJSON()` should see on it. */
  readonly ariaSnapshotByUrl?: Readonly<Record<string, unknown>>;
  /** Maps a normalized URL to the raw page-elements `extractPageElements()` should see on it. */
  readonly elementsByUrl?: Readonly<Record<string, unknown>>;
  /** The session `authenticate()` resolves to for a `cdp-attach` identity in these tests. */
  readonly authStorageState?: StorageStateLike;
  /** Simulates the subrequests a real page fires through the registered route handler on visit. */
  readonly subRequestsByUrl?: Readonly<Record<string, readonly FakeSubRequest[]>>;
  /**
   * Consumed one at a time, in order, by successive `PageLocator.count()` calls across every
   * `getBy*`/`locator()` locator this fake page hands out; the last value repeats once exhausted.
   * Defaults to always resolving to exactly one match.
   */
  readonly locatorCounts?: readonly number[];
}

export interface FakeCrawlPage extends AuthPageLike {
  readonly gotoUrls: string[];
  readonly routeHandlers: RouteHandlerLike[];
}

export function createFakeCrawlPage(options: FakeCrawlPageOptions = {}): FakeCrawlPage {
  const gotoUrls: string[] = [];
  const routeHandlers: RouteHandlerLike[] = [];
  let currentUrl: string | undefined;
  const locatorCounts = options.locatorCounts ?? [1];
  let locatorCallIndex = 0;

  function nextLocatorCount(): number {
    const index = Math.min(locatorCallIndex, locatorCounts.length - 1);
    locatorCallIndex += 1;
    return locatorCounts[index] ?? 1;
  }

  function locator(): PageLocatorLike {
    return { count: () => Promise.resolve(nextLocatorCount()) };
  }

  return {
    gotoUrls,
    routeHandlers,
    goto: async (url) => {
      gotoUrls.push(url);
      currentUrl = url;
      for (const subRequest of options.subRequestsByUrl?.[url] ?? []) {
        for (const handler of routeHandlers) {
          await handler(createFakeRoute(subRequest.method, subRequest.url));
        }
      }
      const configured = options.responsesByUrl?.[url];
      return configured === undefined ? DEFAULT_RESPONSE : configured;
    },
    fill: () => Promise.resolve(),
    click: () => Promise.resolve(),
    waitForLoadState: () => Promise.resolve(),
    route: (_pattern, handler) => {
      routeHandlers.push(handler);
      return Promise.resolve();
    },
    evaluate: () => {
      if (currentUrl === undefined) {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(options.elementsByUrl?.[currentUrl] ?? options.linksByUrl?.[currentUrl]);
    },
    ariaSnapshotJSON: () =>
      Promise.resolve(currentUrl === undefined ? undefined : options.ariaSnapshotByUrl?.[currentUrl]),
    getByRole: () => locator(),
    getByTestId: () => locator(),
    getByLabel: () => locator(),
    getByPlaceholder: () => locator(),
    getByText: () => locator(),
    locator: () => locator(),
    reload: () => Promise.resolve(DEFAULT_RESPONSE),
    setViewportSize: () => Promise.resolve(),
    viewportSize: () => ({ width: 1280, height: 720 }),
    url: () => currentUrl ?? 'about:blank',
    title: () => Promise.resolve(''),
    // Not a real PNG: no code path under test decodes a screenshot, it only has to be bytes.
    screenshot: () => Promise.resolve(new TextEncoder().encode('fake-screenshot')),
  };
}

export interface FakeCrawlBrowserLauncher extends BrowserLauncherLike {
  readonly page: FakeCrawlPage;
  readonly newContextCalls: NewContextOptionsLike[];
  readonly closedBrowsers: number;
}

/** A fake `BrowserLauncher` for crawl tests across the monorepo (AGENTS.md 5.3, 13): no real browser or network call. */
export function createFakeCrawlBrowserLauncher(options: FakeCrawlPageOptions = {}): FakeCrawlBrowserLauncher {
  const page = createFakeCrawlPage(options);
  const newContextCalls: NewContextOptionsLike[] = [];
  let closedBrowsers = 0;

  return {
    page,
    newContextCalls,
    get closedBrowsers() {
      return closedBrowsers;
    },
    launch: () => {
      const context: AuthBrowserContextLike = {
        newPage: () => Promise.resolve(page),
        storageState: () => Promise.resolve(EMPTY_STORAGE_STATE),
        close: () => Promise.resolve(),
      };
      const browser: AuthBrowserLike = {
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
      const authContext: AuthBrowserContextLike = {
        newPage: () => Promise.resolve(page),
        storageState: () => Promise.resolve(options.authStorageState ?? EMPTY_STORAGE_STATE),
        close: () => Promise.resolve(),
      };
      const browser: AuthBrowserLike = {
        newContext: () => Promise.reject(new Error('newContext is not available on an attached browser')),
        contexts: () => [authContext],
        close: () => {
          closedBrowsers += 1;
          return Promise.resolve();
        },
      };
      return Promise.resolve(browser);
    },
  };
}
