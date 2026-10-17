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
import { evaluateNothing } from './fake-browser-launcher.js';

const EMPTY_STORAGE_STATE: StorageStateLike = { cookies: [], origins: [] };
const DEFAULT_RESPONSE: PageResponseLike = { status: () => 200 };
const CLICKED_CONTROL_INDEX = /nth=(\d+)$/;

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

/** What clicking a control during a navigation probe does on a scripted page. */
export interface FakeClickResult {
  /** Where the page ends up; omit for a click that navigates nowhere. */
  readonly url?: string;
  /** Makes the click fail with this message, as an element that is not actionable does. */
  readonly error?: string;
  /** Requests the click makes through the registered route handlers. */
  readonly subRequests?: readonly FakeSubRequest[];
}

/**
 * What one round of opening collapsed panels does on a page: clicks that many controls, rejects the
 * way a page does when a click navigated and destroyed its script context, or navigates the page.
 */
export type FakeRevealRound = number | 'context-destroyed' | { readonly navigatesTo: string };

export interface FakeCrawlPageOptions {
  /** Maps a normalized URL to the URL the page ends up on after `goto()`, as a redirect to sign-in does. */
  readonly redirectsByUrl?: Readonly<Record<string, string>>;
  /** Maps a normalized URL to the response `goto()` resolves with for it; defaults to a 200. */
  readonly responsesByUrl?: Readonly<Record<string, PageResponseLike | null>>;
  /** Maps a normalized URL to the links `extractLinks()` should see on it. */
  readonly linksByUrl?: Readonly<Record<string, readonly string[]>>;
  /** Maps a normalized URL to the accessibility snapshot `ariaSnapshotJSON()` should see on it. */
  readonly ariaSnapshotByUrl?: Readonly<Record<string, unknown>>;
  /** Maps a normalized URL to the raw page-elements `extractPageElements()` should see on it. */
  readonly elementsByUrl?: Readonly<Record<string, unknown>>;
  /**
   * Maps a normalized URL to the raw route-attribute values (`routerLink`, `data-href`) the page
   * evaluates to. As in the generic fake, the page functions are told apart by their names.
   */
  readonly routeAttributeValuesByUrl?: Readonly<Record<string, readonly string[]>>;
  /** Maps a normalized URL to the URLs the page pushed through the History API while loading. */
  readonly historyUrlsByUrl?: Readonly<Record<string, readonly string[]>>;
  /** Maps a normalized URL to the indexes of its navigation controls that are safe to probe. */
  readonly probeControlIndexesByUrl?: Readonly<Record<string, readonly number[]>>;
  /** Maps a page URL, then a control index, to what clicking that control does. */
  /** Maps a normalized URL to the outcome of each successive round of opening collapsed panels on it. */
  readonly revealRoundsByUrl?: Readonly<Record<string, readonly FakeRevealRound[]>>;
  readonly clickResultsByUrl?: Readonly<Record<string, Readonly<Record<number, FakeClickResult>>>>;
  /** What each context's `storageState()` returns, in the order the contexts were opened; empty when omitted. */
  readonly contextStorageStates?: readonly StorageStateLike[];
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
  readonly initScripts: string[];
  readonly clickedSelectors: string[];
}

export function createFakeCrawlPage(
  options: FakeCrawlPageOptions = {},
  contextRouteHandlers: readonly RouteHandlerLike[] = [],
): FakeCrawlPage {
  const gotoUrls: string[] = [];
  const routeHandlers: RouteHandlerLike[] = [];
  const initScripts: string[] = [];
  const clickedSelectors: string[] = [];
  let currentUrl: string | undefined;
  const locatorCounts = options.locatorCounts ?? [1];
  let locatorCallIndex = 0;
  const revealRoundIndexByUrl = new Map<string, number>();

  function nextRevealRound(url: string): Promise<unknown> {
    const index = revealRoundIndexByUrl.get(url) ?? 0;
    revealRoundIndexByUrl.set(url, index + 1);
    const round = options.revealRoundsByUrl?.[url]?.[index] ?? 0;
    if (round === 'context-destroyed') {
      return Promise.reject(
        new Error('Execution context was destroyed, most likely because of a navigation'),
      );
    }
    if (typeof round === 'object') {
      currentUrl = round.navigatesTo;
      return Promise.resolve(1);
    }
    return Promise.resolve(round);
  }

  function nextLocatorCount(): number {
    const index = Math.min(locatorCallIndex, locatorCounts.length - 1);
    locatorCallIndex += 1;
    return locatorCounts[index] ?? 1;
  }

  function locator(): PageLocatorLike {
    return { count: () => Promise.resolve(nextLocatorCount()), evaluate: evaluateNothing };
  }

  async function fireSubRequests(subRequests: readonly FakeSubRequest[]): Promise<void> {
    for (const subRequest of subRequests) {
      for (const handler of [...contextRouteHandlers, ...routeHandlers]) {
        await handler(createFakeRoute(subRequest.method, subRequest.url));
      }
    }
  }

  return {
    gotoUrls,
    routeHandlers,
    initScripts,
    clickedSelectors,
    goto: async (url) => {
      gotoUrls.push(url);
      currentUrl = options.redirectsByUrl?.[url] ?? url;
      await fireSubRequests(options.subRequestsByUrl?.[url] ?? []);
      const configured = options.responsesByUrl?.[url];
      return configured === undefined ? DEFAULT_RESPONSE : configured;
    },
    fill: () => Promise.resolve(),
    click: async (selector) => {
      clickedSelectors.push(selector);
      const index = Number(CLICKED_CONTROL_INDEX.exec(selector)?.[1]);
      const result = currentUrl === undefined ? undefined : options.clickResultsByUrl?.[currentUrl]?.[index];
      if (result === undefined) {
        return;
      }
      if (result.error !== undefined) {
        throw new Error(result.error);
      }
      await fireSubRequests(result.subRequests ?? []);
      currentUrl = result.url ?? currentUrl;
    },
    press: () => Promise.resolve(),
    hover: () => Promise.resolve(),
    selectOption: () => Promise.resolve([]),
    setChecked: () => Promise.resolve(),
    setInputFiles: () => Promise.resolve(),
    on: () => undefined,
    close: () => Promise.resolve(),
    bringToFront: () => Promise.resolve(),
    keyboard: { press: () => Promise.resolve() },
    waitForLoadState: () => Promise.resolve(),
    route: (_pattern, handler) => {
      routeHandlers.push(handler);
      return Promise.resolve();
    },
    evaluate: (pageFunction) => {
      if (currentUrl === undefined) {
        return Promise.resolve(undefined);
      }
      switch (pageFunction.name) {
        case 'readRouteAttributeValues':
          return Promise.resolve(options.routeAttributeValuesByUrl?.[currentUrl]);
        case 'readCapturedHistoryUrls':
          return Promise.resolve(options.historyUrlsByUrl?.[currentUrl]);
        case 'clickCollapsedControls':
          return nextRevealRound(currentUrl);
        case 'listProbeControlIndexes':
          return Promise.resolve(options.probeControlIndexesByUrl?.[currentUrl]);
        default:
          return Promise.resolve(options.elementsByUrl?.[currentUrl] ?? options.linksByUrl?.[currentUrl]);
      }
    },
    ariaSnapshotJSON: () =>
      Promise.resolve(currentUrl === undefined ? undefined : options.ariaSnapshotByUrl?.[currentUrl]),
    addScriptTag: () => Promise.resolve(undefined),
    addInitScript: (script) => {
      initScripts.push(script.content);
      return Promise.resolve(undefined);
    },
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
  /** The page of the first context a launched browser opens: the crawl's own. */
  readonly page: FakeCrawlPage;
  /** Every page a launched browser's contexts handed out, in order: the crawl's, then one per probe. */
  readonly pages: readonly FakeCrawlPage[];
  readonly newContextCalls: NewContextOptionsLike[];
  readonly closedBrowsers: number;
  readonly closedContexts: number;
}

/** A fake `BrowserLauncher` for crawl tests across the monorepo (AGENTS.md 5.3, 13): no real browser or network call. */
export function createFakeCrawlBrowserLauncher(options: FakeCrawlPageOptions = {}): FakeCrawlBrowserLauncher {
  // The crawl's own page lives in the first context, so that context's handlers must reach it too.
  const firstContextRouteHandlers: RouteHandlerLike[] = [];
  const page = createFakeCrawlPage(options, firstContextRouteHandlers);
  const pages: FakeCrawlPage[] = [];
  const newContextCalls: NewContextOptionsLike[] = [];
  let closedBrowsers = 0;
  let closedContexts = 0;

  return {
    page,
    pages,
    newContextCalls,
    get closedBrowsers() {
      return closedBrowsers;
    },
    get closedContexts() {
      return closedContexts;
    },
    launch: () => {
      const openedContexts: AuthBrowserContextLike[] = [];
      const browser: AuthBrowserLike = {
        newContext: (newContextOptions = {}) => {
          newContextCalls.push(newContextOptions);
          // The first context is the crawl's own and shares `page`; every later one is a fresh
          // navigation probe, whose page is its own so a test can tell a probe from the crawl.
          const contextIndex = pages.length;
          const isFirstContext = contextIndex === 0;
          const contextRouteHandlers: RouteHandlerLike[] = isFirstContext ? firstContextRouteHandlers : [];
          const contextPage = isFirstContext ? page : createFakeCrawlPage(options, contextRouteHandlers);
          pages.push(contextPage);
          const context: AuthBrowserContextLike = {
            newPage: () => Promise.resolve(contextPage),
            pages: () => [contextPage],
            storageState: () =>
              Promise.resolve(options.contextStorageStates?.[contextIndex] ?? EMPTY_STORAGE_STATE),
            route: (_pattern, handler) => {
              contextRouteHandlers.push(handler);
              return Promise.resolve();
            },
            on: () => undefined,
            close: () => {
              closedContexts += 1;
              return Promise.resolve();
            },
          };
          openedContexts.push(context);
          return Promise.resolve(context);
        },
        contexts: () => openedContexts,
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
        pages: () => [page],
        storageState: () => Promise.resolve(options.authStorageState ?? EMPTY_STORAGE_STATE),
        route: () => Promise.resolve(),
        on: () => undefined,
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
