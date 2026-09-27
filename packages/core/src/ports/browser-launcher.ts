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
}

/** The narrow slice of Playwright's `Route` API safe mode needs to allow or cancel a request. */
export interface PageRoute {
  request(): RouteRequest;
  abort(): Promise<void>;
  continue(): Promise<void>;
}

export type RouteHandler = (route: PageRoute) => Promise<void> | void;

/** The one piece of Playwright's `Locator` API stability scoring needs: how many elements it resolves to. */
export interface PageLocator {
  count(): Promise<number>;
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

/**
 * The narrow slice of Playwright's `Page` API authentication and crawling need. A real Playwright
 * `Page` satisfies this structurally; unit tests supply a small fake instead (AGENTS.md 5.3, 13).
 */
export interface AuthPage {
  goto(url: string): Promise<PageResponse | null>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
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
  /** The page's current URL, after any redirect or client-side navigation. */
  url(): string;
  title(): Promise<string>;
  /** The page rendered as PNG bytes, registered as `screenshot` evidence (ADR-005). */
  screenshot(options?: ScreenshotOptions): Promise<Uint8Array>;
}

export interface AuthBrowserContext {
  newPage(): Promise<AuthPage>;
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

/** Injected so authentication is testable without actually launching or attaching to a browser. */
export interface BrowserLauncher {
  launch(options?: LaunchOptions): Promise<AuthBrowser>;
  connectOverCdp(endpointUrl: string): Promise<AuthBrowser>;
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
  connectOverCdp: async (endpointUrl) => wrapBrowser(await chromium.connectOverCDP(endpointUrl)),
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
