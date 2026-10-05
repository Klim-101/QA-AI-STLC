// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { chromium, selectors } from 'playwright-core';
import type {
  Browser as PlaywrightBrowser,
  BrowserContext as PlaywrightBrowserContext,
} from 'playwright-core';

/** Playwright's own `BrowserContext.storageState()` return shape: cookies plus per-origin storage. */
export type StorageState = Awaited<ReturnType<PlaywrightBrowserContext['storageState']>>;

/** The one piece of a navigation response the engine reads: its HTTP status. */
export interface PageResponse {
  status(): number;
}

export interface RouteRequest {
  method(): string;
  url(): string;
  /** The complete header set, security-related headers included; absent on test doubles. */
  allHeaders?(): Promise<Record<string, string>>;
}

/** The narrow slice of Playwright's `Route` API safe mode needs to allow or cancel a request. */
export interface PageRoute {
  request(): RouteRequest;
  abort(): Promise<void>;
  continue(): Promise<void>;
}

/** The narrow slice of Playwright's `ConsoleMessage` the session's console log needs. */
export interface PageConsoleMessage {
  type(): string;
  text(): string;
}

/** The slice of a request the network log reads. */
export interface PageLoggedRequest {
  method(): string;
  url(): string;
  /** Why the request failed, or null for one that did not. */
  failure(): { readonly errorText: string } | null;
}

/** The slice of a response the network log reads. */
export interface PageLoggedResponse {
  status(): number;
  url(): string;
  request(): { method(): string };
}

export type RouteHandler = (route: PageRoute) => Promise<void> | void;

/** The narrow slice of Playwright's `Dialog` the session's dialog policy needs. */
export interface PageDialog {
  /** `alert`, `confirm`, `prompt` or `beforeunload`. */
  type(): string;
  message(): string;
  accept(): Promise<void>;
  dismiss(): Promise<void>;
}

/**
 * The pieces of Playwright's `Locator` API the engine needs: how many elements it resolves to
 * (stability scoring) and a read-only look at the one element it resolves to (widget actions,
 * P6-43).
 */
export interface PageLocator {
  count(): Promise<number>;
  /**
   * Runs `pageFunction` in the page against the single element the locator resolves to, waiting
   * for it first. Loosely typed on purpose: Playwright's own `evaluate` types the element and the
   * argument in ways no narrower signature of ours is assignable to, so page functions take `unknown`.
   */
  evaluate(
    pageFunction: (element: never, arg: unknown) => unknown,
    arg?: unknown,
    options?: PageActionOptions,
  ): Promise<unknown>;
}

export interface GetByRoleOptions {
  readonly name?: string;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface ScreenshotOptions {
  readonly fullPage?: boolean;
}

/** Milliseconds Playwright waits before failing a navigation or an action (P6-23, ADR-011). */
export interface PageActionOptions {
  readonly timeout?: number;
}

/**
 * The narrow slice of Playwright's `Page` API authentication and crawling need. A real Playwright
 * `Page` satisfies this structurally; unit tests supply a small fake instead (AGENTS.md 5.3, 13).
 */
export interface AuthPage {
  goto(url: string, options?: PageActionOptions): Promise<PageResponse | null>;
  fill(selector: string, value: string, options?: PageActionOptions): Promise<void>;
  click(selector: string, options?: PageActionOptions): Promise<void>;
  /** Focuses the element, then presses a key or chord (`Enter`, `Control+a`) on it. */
  press(selector: string, key: string, options?: PageActionOptions): Promise<void>;
  hover(selector: string, options?: PageActionOptions): Promise<void>;
  /** Picks the options of a native select whose visible label equals each given one, replacing its selection. */
  selectOption(
    selector: string,
    options: readonly { readonly label: string }[],
    pageOptions?: PageActionOptions,
  ): Promise<unknown>;
  /** Sets a checkbox or radio to `checked`; Playwright fails when the state does not change. */
  setChecked(selector: string, checked: boolean, options?: PageActionOptions): Promise<void>;
  /**
   * Sets files on a file input from bytes the engine has already read, scanned and hashed, so
   * what is sent is exactly what was recorded.
   */
  setInputFiles(
    selector: string,
    files: readonly { readonly name: string; readonly mimeType: string; readonly buffer: Buffer }[],
    options?: PageActionOptions,
  ): Promise<void>;
  /** The page's keyboard, which presses a key on whatever element has focus. */
  readonly keyboard: { press(key: string): Promise<void> };
  waitForLoadState(state?: 'load' | 'domcontentloaded' | 'networkidle'): Promise<void>;
  /** Intercepts every request matching `pattern` (a glob, per Playwright's own syntax). */
  route(pattern: string, handler: RouteHandler): Promise<unknown>;
  /**
   * Runs `pageFunction` in the page's browsing context, passing `arg` across the CDP boundary as
   * Playwright's own `page.evaluate(pageFunction, arg)` does (a closure over an outer-scope
   * variable is never available inside the browser). Untyped: callers narrow the result. Generic,
   * matching Playwright's own `evaluate<R, Arg>` shape, so `arg`'s type is checked against
   * `pageFunction`'s own parameter instead of forcing every caller through `unknown`; every test
   * double implementing this interface must declare the same generic method shape (AuthPageLike and
   * its extensions in `@qa-ai-stlc/test-utils`), or a non-generic override is rejected as too narrow
   * for every possible `Arg`.
   */
  evaluate<Arg = void>(pageFunction: (arg: Arg) => unknown, arg?: Arg): Promise<unknown>;
  /** The page's accessibility tree as free-form JSON (Playwright's own aria snapshot). */
  ariaSnapshotJSON(): Promise<unknown>;
  /** Injects a script into the page (P3-14: loading axe-core for an accessibility scan). */
  addScriptTag(options: { readonly content: string }): Promise<unknown>;
  getByRole(role: string, options?: GetByRoleOptions): PageLocator;
  getByTestId(testId: string): PageLocator;
  getByLabel(text: string): PageLocator;
  getByPlaceholder(text: string): PageLocator;
  getByText(text: string): PageLocator;
  locator(selector: string): PageLocator;
  reload(): Promise<PageResponse | null>;
  setViewportSize(size: ViewportSize): Promise<void>;
  viewportSize(): ViewportSize | null;
  /** Fires when the page raises a JavaScript dialog; the page stays blocked until it is handled. */
  on(event: 'dialog', handler: (dialog: PageDialog) => void): unknown;
  /** Fires once when the page closes, whoever closed it. */
  on(event: 'close', handler: () => void): unknown;
  /** Fires for every message the page writes to its console. */
  on(event: 'console', handler: (message: PageConsoleMessage) => void): unknown;
  /** Fires for an uncaught exception in the page. */
  on(event: 'pageerror', handler: (error: Error) => void): unknown;
  /** Fires for every response the page receives. */
  on(event: 'response', handler: (response: PageLoggedResponse) => void): unknown;
  /** Fires for a request that failed before any response, including one safe mode aborted. */
  on(event: 'requestfailed', handler: (request: PageLoggedRequest) => void): unknown;
  close(): Promise<void>;
  /** Makes this page the one the browser shows, which is what a tab switch means to the user. */
  bringToFront(): Promise<void>;
  /** The page's current URL, after any redirect or client-side navigation. */
  url(): string;
  title(): Promise<string>;
  /** The page rendered as PNG bytes, registered as `screenshot` evidence (ADR-005). */
  screenshot(options?: ScreenshotOptions): Promise<Uint8Array>;
}

export interface AuthBrowserContext {
  newPage(): Promise<AuthPage>;
  /** The pages the context has open right now, which for an attached browser are the operator's. */
  pages(): readonly AuthPage[];
  /**
   * Intercepts every request of every page in the context, including a popup's very first one,
   * which a per-page `route` registered after the page exists would miss.
   */
  route(pattern: string, handler: RouteHandler): Promise<unknown>;
  /** Fires for every page the context opens after this call, whether script or a link opened it. */
  on(event: 'page', handler: (page: AuthPage) => void): unknown;
  storageState(): Promise<StorageState>;
  close(): Promise<void>;
}

export interface NewContextOptions {
  /** Reuses a session `authenticate()` already captured, instead of logging in again. */
  readonly storageState?: StorageState;
  /** Bypasses TLS certificate validation for this context (P2-18); off by default. */
  readonly ignoreHttpsErrors?: boolean;
}

export interface AuthBrowser {
  newContext(options?: NewContextOptions): Promise<AuthBrowserContext>;
  /** The contexts an attached, already-authenticated browser owns (ADR-004, section 6.2 step 1). */
  contexts(): readonly AuthBrowserContext[];
  close(): Promise<void>;
}

export interface LaunchOptions {
  /**
   * Pick mode needs a visible window for a human to click (development plan section 6.1); every
   * other caller launches headless. Omitted, Playwright's own default (`true`) applies.
   */
  readonly headless?: boolean;
}

export interface ConnectOverCdpOptions {
  readonly timeoutMs?: number;
}

/** Injected so authentication is testable without actually launching or attaching to a browser. */
export interface BrowserLauncher {
  launch(options?: LaunchOptions): Promise<AuthBrowser>;
  /** `timeoutMs` bounds the connection attempt; omitted, Playwright's own default applies. */
  connectOverCdp(endpointUrl: string, options?: ConnectOverCdpOptions): Promise<AuthBrowser>;
}

// Playwright's own `newContext()` names its TLS option `ignoreHTTPSErrors`; this project's naming
// convention treats acronyms as words (AGENTS.md 7.1), so `AuthBrowser` exposes `ignoreHttpsErrors`
// instead and this wrapper translates it back at the one point it actually reaches Playwright.
function wrapBrowser(browser: PlaywrightBrowser): AuthBrowser {
  return {
    newContext: (options) =>
      browser.newContext({
        ...(options?.storageState !== undefined ? { storageState: options.storageState } : {}),
        ...(options?.ignoreHttpsErrors !== undefined ? { ignoreHTTPSErrors: options.ignoreHttpsErrors } : {}),
      }),
    contexts: () => browser.contexts(),
    close: () => browser.close(),
  };
}

export const playwrightBrowserLauncher: BrowserLauncher = {
  launch: async (options) =>
    wrapBrowser(await chromium.launch(options?.headless === undefined ? {} : { headless: options.headless })),
  connectOverCdp: async (endpointUrl, options) =>
    wrapBrowser(
      await chromium.connectOverCDP(
        endpointUrl,
        options?.timeoutMs === undefined ? {} : { timeout: options.timeoutMs },
      ),
    ),
};

/**
 * Tells Playwright which attribute `page.getByTestId()` (both the explorer's own live scoring and
 * a generated test's `AuthPage.getByTestId` calls) resolves against, for an application that does
 * not use the `data-testid` convention (`config.selectors.testIdAttribute`, AGENTS.md 12.7: this
 * mirrors the attribute name the explorer itself reads off the DOM, or the two would silently
 * disagree). Applies process-wide to every page created afterwards; call it once, before the first
 * browser launch of a session that will call `getByTestId`.
 */
export function configureTestIdAttribute(attribute: string): void {
  selectors.setTestIdAttribute(attribute);
}
