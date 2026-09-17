// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { chromium } from 'playwright';
import type { BrowserContext as PlaywrightBrowserContext } from 'playwright';

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
  /** Runs `pageFunction` in the page's browsing context. Untyped: callers narrow the result. */
  evaluate(pageFunction: () => unknown): Promise<unknown>;
  /** The page's accessibility tree as free-form JSON (Playwright's own aria snapshot). */
  ariaSnapshotJSON(): Promise<unknown>;
}

export interface AuthBrowserContext {
  newPage(): Promise<AuthPage>;
  storageState(): Promise<StorageState>;
  close(): Promise<void>;
}

export interface NewContextOptions {
  /** Reuses a session `authenticate()` already captured, instead of logging in again. */
  readonly storageState?: StorageState;
}

export interface AuthBrowser {
  newContext(options?: NewContextOptions): Promise<AuthBrowserContext>;
  /** The contexts an attached, already-authenticated browser owns (ADR-004, section 6.2 step 1). */
  contexts(): readonly AuthBrowserContext[];
  close(): Promise<void>;
}

/** Injected so authentication is testable without actually launching or attaching to a browser. */
export interface BrowserLauncher {
  launch(): Promise<AuthBrowser>;
  connectOverCdp(endpointUrl: string): Promise<AuthBrowser>;
}

export const playwrightBrowserLauncher: BrowserLauncher = {
  launch: () => chromium.launch(),
  connectOverCdp: (endpointUrl) => chromium.connectOverCDP(endpointUrl),
};
