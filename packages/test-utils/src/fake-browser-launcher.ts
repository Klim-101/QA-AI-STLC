// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// This package stays a leaf with no dependency on any other workspace package (AGENTS.md 5.7), so
// every type below is a plain structural duplicate of `@qa-ai-stlc/core`'s `browser-launcher.ts`
// port rather than an import of it -- TypeScript's structural typing means every value below still
// satisfies the real `BrowserLauncher`/`AuthPage`/... at every call site that expects one.
// `StorageState` is Playwright's own generated type (`BrowserContext.storageState()`'s return
// shape), with concrete, non-readonly cookie/origin record types this leaf package cannot
// reasonably re-derive without depending on Playwright itself. `any` here (not `unknown`) is the
// deliberate, narrowly-scoped exception AGENTS.md 5.2 allows: `unknown[]` is not assignable to
// Playwright's concrete array types, so every fake in this file would otherwise fail to satisfy
// the real `AuthBrowserContext`/`BrowserLauncher` at every production call site that uses one.
export interface StorageStateLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see file-level note above
  cookies: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see file-level note above
  origins: any[];
}

export interface PageResponseLike {
  status(): number;
}

export interface PageLocatorLike {
  count(): Promise<number>;
}

export interface RouteRequestLike {
  method(): string;
  url(): string;
}

export interface PageRouteLike {
  request(): RouteRequestLike;
  abort(): Promise<void>;
  continue(): Promise<void>;
}

export type RouteHandlerLike = (route: PageRouteLike) => Promise<void> | void;

export interface GetByRoleOptionsLike {
  readonly name?: string;
}

export interface ViewportSizeLike {
  readonly width: number;
  readonly height: number;
}

export interface ScreenshotOptionsLike {
  readonly fullPage?: boolean;
}

export interface AuthPageLike {
  goto(url: string): Promise<PageResponseLike | null>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  waitForLoadState(state?: 'load' | 'domcontentloaded' | 'networkidle'): Promise<void>;
  route(pattern: string, handler: RouteHandlerLike): Promise<unknown>;
  evaluate(pageFunction: () => unknown): Promise<unknown>;
  ariaSnapshotJSON(): Promise<unknown>;
  getByRole(role: string, options?: GetByRoleOptionsLike): PageLocatorLike;
  getByTestId(testId: string): PageLocatorLike;
  getByLabel(text: string): PageLocatorLike;
  getByPlaceholder(text: string): PageLocatorLike;
  getByText(text: string): PageLocatorLike;
  locator(selector: string): PageLocatorLike;
  reload(): Promise<PageResponseLike | null>;
  setViewportSize(size: ViewportSizeLike): Promise<void>;
  viewportSize(): ViewportSizeLike | null;
  url(): string;
  title(): Promise<string>;
  screenshot(options?: ScreenshotOptionsLike): Promise<Uint8Array>;
}

export interface AuthBrowserContextLike {
  newPage(): Promise<AuthPageLike>;
  storageState(): Promise<StorageStateLike>;
  close(): Promise<void>;
}

export interface NewContextOptionsLike {
  readonly storageState?: StorageStateLike;
}

export interface AuthBrowserLike {
  newContext(options?: NewContextOptionsLike): Promise<AuthBrowserContextLike>;
  contexts(): readonly AuthBrowserContextLike[];
  close(): Promise<void>;
}

export interface LaunchOptionsLike {
  readonly headless?: boolean;
}

export interface BrowserLauncherLike {
  launch(options?: LaunchOptionsLike): Promise<AuthBrowserLike>;
  connectOverCdp(endpointUrl: string): Promise<AuthBrowserLike>;
}

const EMPTY_STORAGE_STATE: StorageStateLike = { cookies: [], origins: [] };

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
    | 'setViewportSize'
    | 'screenshot'
    | 'title';
  readonly args: readonly unknown[];
}

export interface FakeBrowserLauncherOptions {
  readonly storageState?: StorageStateLike;
  readonly contexts?: readonly AuthBrowserContextLike[];
  /** Returned by every `page.goto()` call; defaults to a 200 response. */
  readonly gotoResponse?: PageResponseLike | null;
  /** Returned by every `page.reload()` call; defaults to a 200 response. */
  readonly reloadResponse?: PageResponseLike | null;
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
  readonly viewportSize?: ViewportSizeLike | null;
  /** The URL `page.url()` reports before any navigation; defaults to `about:blank`. */
  readonly initialUrl?: string;
  /** Returned by `page.title()`; defaults to an empty title. */
  readonly title?: string;
  /** The PNG bytes `page.screenshot()` resolves with; defaults to a short placeholder. */
  readonly screenshotBytes?: Uint8Array;
}

export interface FakeBrowserLauncher extends BrowserLauncherLike {
  readonly pageCalls: FakePageCall[];
  readonly closedBrowsers: number;
  readonly newContextCalls: NewContextOptionsLike[];
}

const DEFAULT_GOTO_RESPONSE: PageResponseLike = { status: () => 200 };
const DEFAULT_VIEWPORT_SIZE: ViewportSizeLike = { width: 1280, height: 720 };
// Not a real PNG: nothing under test decodes it, and a byte string keeps the fixture readable.
const DEFAULT_SCREENSHOT_BYTES = new TextEncoder().encode('fake-screenshot');

function createFakePage(calls: FakePageCall[], options: FakeBrowserLauncherOptions): AuthPageLike {
  let currentUrl = options.initialUrl ?? 'about:blank';
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

  function fakeLocator(method: FakePageCall['method'], args: readonly unknown[]): PageLocatorLike {
    calls.push({ method, args });
    return { count: () => Promise.resolve(nextLocatorCount()) };
  }

  return {
    goto: (...args) => {
      calls.push({ method: 'goto', args });
      currentUrl = args[0];
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
    url: () => currentUrl,
    title: (...args) => {
      calls.push({ method: 'title', args });
      return Promise.resolve(options.title ?? '');
    },
    screenshot: (...args) => {
      calls.push({ method: 'screenshot', args });
      return Promise.resolve(options.screenshotBytes ?? DEFAULT_SCREENSHOT_BYTES);
    },
  };
}

/**
 * A generic `BrowserLauncher` for unit tests across the monorepo (AGENTS.md 5.3, 13): no real
 * browser is ever launched. Logs every call the fake page received, in order, for tests that need
 * to assert on call sequencing rather than just return values.
 */
export function createFakeBrowserLauncher(options: FakeBrowserLauncherOptions = {}): FakeBrowserLauncher {
  const pageCalls: FakePageCall[] = [];
  const newContextCalls: NewContextOptionsLike[] = [];
  let closedBrowsers = 0;
  const storageState = options.storageState ?? EMPTY_STORAGE_STATE;

  const launcher: FakeBrowserLauncher = {
    pageCalls,
    newContextCalls,
    get closedBrowsers() {
      return closedBrowsers;
    },
    launch: () => {
      const context: AuthBrowserContextLike = {
        newPage: () => Promise.resolve(createFakePage(pageCalls, options)),
        storageState: () => Promise.resolve(storageState),
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
      const browser: AuthBrowserLike = {
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
