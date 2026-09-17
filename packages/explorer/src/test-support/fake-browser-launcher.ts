// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type {
  AuthBrowser,
  AuthBrowserContext,
  AuthPage,
  BrowserLauncher,
  NewContextOptions,
  PageResponse,
  PageRoute,
  RouteHandler,
  StorageState,
} from '@qa-ai-stlc/core';
import { createLocatorMethods } from './locator-stub.js';

const EMPTY_STORAGE_STATE: StorageState = { cookies: [], origins: [] };

function createFakeRoute(method: string, url: string): PageRoute {
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
  readonly responsesByUrl?: Readonly<Record<string, PageResponse | null>>;
  /** Maps a normalized URL to the links `extractLinks()` should see on it. */
  readonly linksByUrl?: Readonly<Record<string, readonly string[]>>;
  /** Maps a normalized URL to the accessibility snapshot `ariaSnapshotJSON()` should see on it. */
  readonly ariaSnapshotByUrl?: Readonly<Record<string, unknown>>;
  /** Maps a normalized URL to the raw page-elements `extractPageElements()` should see on it. */
  readonly elementsByUrl?: Readonly<Record<string, unknown>>;
  /** The session `authenticate()` resolves to for a `cdp-attach` identity in these tests. */
  readonly authStorageState?: StorageState;
  /** Simulates the subrequests a real page fires through the registered route handler on visit. */
  readonly subRequestsByUrl?: Readonly<Record<string, readonly FakeSubRequest[]>>;
}

export interface FakeCrawlPage extends AuthPage {
  readonly gotoUrls: string[];
  readonly routeHandlers: RouteHandler[];
}

const DEFAULT_RESPONSE: PageResponse = { status: () => 200 };

export function createFakeCrawlPage(options: FakeCrawlPageOptions = {}): FakeCrawlPage {
  const gotoUrls: string[] = [];
  const routeHandlers: RouteHandler[] = [];
  let currentUrl: string | undefined;

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
    ...createLocatorMethods(),
  };
}

export interface FakeCrawlBrowserLauncher extends BrowserLauncher {
  readonly page: FakeCrawlPage;
  readonly newContextCalls: NewContextOptions[];
  readonly closedBrowsers: number;
}

/** A fake `BrowserLauncher` for crawl tests: no real browser or network call (AGENTS.md 5.3, 13). */
export function createFakeCrawlBrowserLauncher(options: FakeCrawlPageOptions = {}): FakeCrawlBrowserLauncher {
  const page = createFakeCrawlPage(options);
  const newContextCalls: NewContextOptions[] = [];
  let closedBrowsers = 0;

  return {
    page,
    newContextCalls,
    get closedBrowsers() {
      return closedBrowsers;
    },
    launch: () => {
      const context: AuthBrowserContext = {
        newPage: () => Promise.resolve(page),
        storageState: () => Promise.resolve(EMPTY_STORAGE_STATE),
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
      const authContext: AuthBrowserContext = {
        newPage: () => Promise.resolve(page),
        storageState: () => Promise.resolve(options.authStorageState ?? EMPTY_STORAGE_STATE),
        close: () => Promise.resolve(),
      };
      const browser: AuthBrowser = {
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
