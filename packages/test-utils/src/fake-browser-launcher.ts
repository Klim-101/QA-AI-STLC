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
  evaluate(
    pageFunction: (element: never, arg: unknown) => unknown,
    arg?: unknown,
    options?: { readonly timeout?: number },
  ): Promise<unknown>;
}

/** The `evaluate` every fake locator shares: there is no element to run a function against. */
export function evaluateNothing(): Promise<unknown> {
  return Promise.resolve(undefined);
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

export interface PageDialogLike {
  type(): string;
  message(): string;
  accept(): Promise<void>;
  dismiss(): Promise<void>;
}

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
  press(selector: string, key: string): Promise<void>;
  hover(selector: string): Promise<void>;
  selectOption(selector: string, options: readonly { readonly label: string }[]): Promise<unknown>;
  setChecked(selector: string, checked: boolean): Promise<void>;
  on(event: 'dialog', handler: (dialog: PageDialogLike) => void): unknown;
  on(event: 'close', handler: () => void): unknown;
  close(): Promise<void>;
  bringToFront(): Promise<void>;
  readonly keyboard: { press(key: string): Promise<void> };
  waitForLoadState(state?: 'load' | 'domcontentloaded' | 'networkidle'): Promise<void>;
  route(pattern: string, handler: RouteHandlerLike): Promise<unknown>;
  evaluate<Arg = void>(pageFunction: (arg: Arg) => unknown, arg?: Arg): Promise<unknown>;
  ariaSnapshotJSON(): Promise<unknown>;
  addScriptTag(options: { readonly content: string }): Promise<unknown>;
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
  route(pattern: string, handler: RouteHandlerLike): Promise<unknown>;
  on(event: 'page', handler: (page: AuthPageLike) => void): unknown;
  storageState(): Promise<StorageStateLike>;
  close(): Promise<void>;
}

export interface NewContextOptionsLike {
  readonly storageState?: StorageStateLike;
  readonly ignoreHttpsErrors?: boolean;
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
    | 'press'
    | 'hover'
    | 'selectOption'
    | 'setChecked'
    | 'keyboardPress'
    | 'waitForLoadState'
    | 'route'
    | 'contextRoute'
    | 'bringToFront'
    | 'close'
    | 'evaluate'
    | 'ariaSnapshotJSON'
    | 'addScriptTag'
    | 'getByRole'
    | 'getByTestId'
    | 'getByLabel'
    | 'getByPlaceholder'
    | 'getByText'
    | 'locator'
    | 'locatorEvaluate'
    | 'reload'
    | 'setViewportSize'
    | 'screenshot'
    | 'title';
  readonly args: readonly unknown[];
}

/** One `locator(selector).evaluate(pageFunction, arg)` call, as a scripted page sees it. */
export interface FakeLocatorEvaluateCall {
  readonly selector: unknown;
  readonly functionName: string;
  readonly arg: unknown;
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
  /**
   * Answers every `locator(selector).evaluate(pageFunction, arg)` call, which runs in the page in
   * production: a test scripts the page's answer by the page function's name. Without it the call
   * resolves to `undefined`.
   */
  readonly locatorEvaluate?: (call: FakeLocatorEvaluateCall) => unknown;
  /**
   * What successive `page.click()` calls do, in order: an `Error` rejects that call, `undefined`
   * resolves it. Once the list is used up every click resolves.
   */
  readonly clickOutcomes?: readonly (Error | undefined)[];
  /** Returned by `page.viewportSize()`; defaults to a 1280x720 desktop size. */
  readonly viewportSize?: ViewportSizeLike | null;
  /** The URL `page.url()` reports before any navigation; defaults to `about:blank`. */
  readonly initialUrl?: string;
  /** Returned by `page.title()`; defaults to an empty title. */
  readonly title?: string;
  /** The PNG bytes `page.screenshot()` resolves with; defaults to a short placeholder. */
  readonly screenshotBytes?: Uint8Array;
}

/** What a fake dialog was told to do: the engine's dialog policy is observable through it. */
export interface FakeDialogOutcome {
  readonly type: string;
  readonly message: string;
  readonly action: 'accepted' | 'dismissed';
}

export interface FakeBrowserLauncher extends BrowserLauncherLike {
  readonly pageCalls: FakePageCall[];
  /** Every dialog raised through `raiseDialog`, with what the engine did with it. */
  readonly dialogOutcomes: FakeDialogOutcome[];
  /** The pages the fake context has handed out, the first being the one `newPage` returned. */
  readonly pages: readonly AuthPageLike[];
  /** Pages that have been closed, by `page.close()`. */
  readonly closedPages: readonly AuthPageLike[];
  /** Makes `pages[pageIndex]` raise a JavaScript dialog; its handlers run synchronously. */
  raiseDialog(type: string, message: string, pageIndex?: number): void;
  /** Opens a new page at `url` the way a link with `target=_blank` does, and returns it. */
  openPopup(url: string): AuthPageLike;
  /** Makes every later dialog reject `accept()` and `dismiss()` with `reason`, as a page that is already gone does. */
  failDialogsWith(reason: unknown): void;
  /** Makes `message()` of every later dialog throw `reason`. */
  breakDialogMessages(reason: unknown): void;
  /** Makes `page.close()` of every page reject with `reason` instead of closing it. */
  failClosingWith(reason: unknown): void;
  /** Makes `page.waitForLoadState()` of every page reject with `reason`. */
  failLoadStateWith(reason: unknown): void;
  readonly closedBrowsers: number;
  readonly newContextCalls: NewContextOptionsLike[];
}

const DEFAULT_GOTO_RESPONSE: PageResponseLike = { status: () => 200 };
const DEFAULT_VIEWPORT_SIZE: ViewportSizeLike = { width: 1280, height: 720 };
// Not a real PNG: nothing under test decodes it, and a byte string keeps the fixture readable.
const DEFAULT_SCREENSHOT_BYTES = new TextEncoder().encode('fake-screenshot');

/** The failures a test can switch on; read when the call happens, so they apply to pages already open. */
interface FakeFailures {
  dialog?: { readonly reason: unknown };
  dialogMessage?: { readonly reason: unknown };
  close?: { readonly reason: unknown };
  loadState?: { readonly reason: unknown };
}

interface FakePageHandle {
  readonly page: AuthPageLike;
  readonly dialogHandlers: ((dialog: PageDialogLike) => void)[];
}

function createFakePage(
  calls: FakePageCall[],
  options: FakeBrowserLauncherOptions,
  initialUrl: string,
  onClosed: (page: AuthPageLike) => void,
  failures: FakeFailures,
): FakePageHandle {
  let currentUrl = initialUrl;
  const dialogHandlers: ((dialog: PageDialogLike) => void)[] = [];
  const closeHandlers: (() => void)[] = [];
  // `??` would also replace an explicitly configured `null` (a deliberately failed navigation),
  // so presence is checked instead of nullishness.
  const gotoResponse = 'gotoResponse' in options ? options.gotoResponse : DEFAULT_GOTO_RESPONSE;
  const reloadResponse = 'reloadResponse' in options ? options.reloadResponse : DEFAULT_GOTO_RESPONSE;
  const locatorCounts = options.locatorCounts ?? [1];
  let clickCount = 0;
  let locatorCallIndex = 0;

  function nextLocatorCount(): number {
    const index = Math.min(locatorCallIndex, locatorCounts.length - 1);
    locatorCallIndex += 1;
    return locatorCounts[index] ?? 1;
  }

  function fakeLocator(method: FakePageCall['method'], args: readonly unknown[]): PageLocatorLike {
    calls.push({ method, args });
    return {
      count: () => Promise.resolve(nextLocatorCount()),
      evaluate: (pageFunction, arg, evaluateOptions) => {
        calls.push({ method: 'locatorEvaluate', args: [args[0], pageFunction.name, arg, evaluateOptions] });
        return Promise.resolve(
          options.locatorEvaluate?.({ selector: args[0], functionName: pageFunction.name, arg }),
        );
      },
    };
  }

  const page: AuthPageLike = {
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
      const outcome = options.clickOutcomes?.[clickCount];
      clickCount += 1;
      return outcome === undefined ? Promise.resolve() : Promise.reject(outcome);
    },
    press: (...args) => {
      calls.push({ method: 'press', args });
      return Promise.resolve();
    },
    hover: (...args) => {
      calls.push({ method: 'hover', args });
      return Promise.resolve();
    },
    selectOption: (...args) => {
      calls.push({ method: 'selectOption', args });
      return Promise.resolve([]);
    },
    setChecked: (...args) => {
      calls.push({ method: 'setChecked', args });
      return Promise.resolve();
    },
    on: (event: 'dialog' | 'close', handler: ((dialog: PageDialogLike) => void) & (() => void)) => {
      if (event === 'dialog') {
        dialogHandlers.push(handler);
      } else {
        closeHandlers.push(handler);
      }
    },
    close: () => {
      calls.push({ method: 'close', args: [] });
      if (failures.close !== undefined) {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a test scripts any reason, including a non-Error one, to reach the engine's handling of it
        return Promise.reject(failures.close.reason);
      }
      onClosed(page);
      for (const handler of closeHandlers) {
        handler();
      }
      return Promise.resolve();
    },
    bringToFront: () => {
      calls.push({ method: 'bringToFront', args: [] });
      return Promise.resolve();
    },
    keyboard: {
      press: (...args) => {
        calls.push({ method: 'keyboardPress', args });
        return Promise.resolve();
      },
    },
    waitForLoadState: (...args) => {
      calls.push({ method: 'waitForLoadState', args });
      if (failures.loadState === undefined) {
        return Promise.resolve();
      }
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a test scripts any reason, including a non-Error one, to reach the engine's handling of it
      return Promise.reject(failures.loadState.reason);
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
    addScriptTag: (...args) => {
      calls.push({ method: 'addScriptTag', args });
      return Promise.resolve(undefined);
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
  return { page, dialogHandlers };
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
  const dialogOutcomes: FakeDialogOutcome[] = [];
  const handles: FakePageHandle[] = [];
  const closedPages: AuthPageLike[] = [];
  const pageHandlers: ((page: AuthPageLike) => void)[] = [];
  const failures: FakeFailures = {};

  function addPage(url: string): FakePageHandle {
    const handle = createFakePage(pageCalls, options, url, (closed) => closedPages.push(closed), failures);
    handles.push(handle);
    return handle;
  }

  const launcher: FakeBrowserLauncher = {
    pageCalls,
    newContextCalls,
    dialogOutcomes,
    closedPages,
    get pages() {
      return handles.map((handle) => handle.page);
    },
    raiseDialog: (type, message, pageIndex = 0) => {
      const outcome = (action: FakeDialogOutcome['action']): Promise<void> => {
        if (failures.dialog !== undefined) {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a test scripts any reason, including a non-Error one, to reach the engine's handling of it
          return Promise.reject(failures.dialog.reason);
        }
        dialogOutcomes.push({ type, message, action });
        return Promise.resolve();
      };
      const dialog: PageDialogLike = {
        type: () => type,
        message: () => {
          if (failures.dialogMessage !== undefined) {
            throw failures.dialogMessage.reason;
          }
          return message;
        },
        accept: () => outcome('accepted'),
        dismiss: () => outcome('dismissed'),
      };
      for (const handler of handles[pageIndex]?.dialogHandlers ?? []) {
        handler(dialog);
      }
    },
    failDialogsWith: (reason) => {
      failures.dialog = { reason };
    },
    breakDialogMessages: (reason) => {
      failures.dialogMessage = { reason };
    },
    failClosingWith: (reason) => {
      failures.close = { reason };
    },
    failLoadStateWith: (reason) => {
      failures.loadState = { reason };
    },
    openPopup: (url) => {
      const { page } = addPage(url);
      for (const handler of pageHandlers) {
        handler(page);
      }
      return page;
    },
    get closedBrowsers() {
      return closedBrowsers;
    },
    launch: () => {
      const context: AuthBrowserContextLike = {
        newPage: () => Promise.resolve(addPage(options.initialUrl ?? 'about:blank').page),
        storageState: () => Promise.resolve(storageState),
        route: (...args) => {
          pageCalls.push({ method: 'contextRoute', args });
          return Promise.resolve();
        },
        on: (_event, handler) => {
          pageHandlers.push(handler);
        },
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
