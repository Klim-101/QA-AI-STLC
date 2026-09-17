// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { chromium } from 'playwright';
import type { BrowserContext as PlaywrightBrowserContext } from 'playwright';

/** Playwright's own `BrowserContext.storageState()` return shape: cookies plus per-origin storage. */
export type StorageState = Awaited<ReturnType<PlaywrightBrowserContext['storageState']>>;

/**
 * The narrow slice of Playwright's `Page` API authentication needs. A real Playwright `Page`
 * satisfies this structurally; unit tests supply a small fake instead (AGENTS.md 5.3, 13).
 */
export interface AuthPage {
  goto(url: string): Promise<unknown>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  waitForLoadState(state?: 'load' | 'domcontentloaded' | 'networkidle'): Promise<void>;
}

export interface AuthBrowserContext {
  newPage(): Promise<AuthPage>;
  storageState(): Promise<StorageState>;
  close(): Promise<void>;
}

export interface AuthBrowser {
  newContext(): Promise<AuthBrowserContext>;
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
