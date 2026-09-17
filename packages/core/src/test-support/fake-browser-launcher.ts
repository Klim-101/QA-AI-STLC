// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type {
  AuthBrowser,
  AuthBrowserContext,
  AuthPage,
  BrowserLauncher,
  NewContextOptions,
  PageResponse,
  StorageState,
} from '../ports/browser-launcher.js';

const EMPTY_STORAGE_STATE: StorageState = { cookies: [], origins: [] };

export interface FakePageCall {
  readonly method: 'goto' | 'fill' | 'click' | 'waitForLoadState' | 'route' | 'evaluate';
  readonly args: readonly unknown[];
}

export interface FakeBrowserLauncherOptions {
  readonly storageState?: StorageState;
  readonly contexts?: readonly AuthBrowserContext[];
  /** Returned by every `page.goto()` call; defaults to a 200 response. */
  readonly gotoResponse?: PageResponse | null;
  /** Returned by every `page.evaluate()` call; defaults to `undefined`. */
  readonly evaluateResult?: unknown;
}

export interface FakeBrowserLauncher extends BrowserLauncher {
  readonly pageCalls: FakePageCall[];
  readonly closedBrowsers: number;
  readonly newContextCalls: NewContextOptions[];
}

const DEFAULT_GOTO_RESPONSE: PageResponse = { status: () => 200 };

function createFakePage(calls: FakePageCall[], options: FakeBrowserLauncherOptions): AuthPage {
  // `??` would also replace an explicitly configured `null` (a deliberately failed navigation),
  // so presence is checked instead of nullishness.
  const gotoResponse = 'gotoResponse' in options ? options.gotoResponse : DEFAULT_GOTO_RESPONSE;
  return {
    goto: (...args) => {
      calls.push({ method: 'goto', args });
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
  };
}

/** A fake `BrowserLauncher` for unit tests: no real browser is ever launched (AGENTS.md 5.3, 13). */
export function createFakeBrowserLauncher(options: FakeBrowserLauncherOptions = {}): FakeBrowserLauncher {
  const pageCalls: FakePageCall[] = [];
  const newContextCalls: NewContextOptions[] = [];
  let closedBrowsers = 0;
  const storageState = options.storageState ?? EMPTY_STORAGE_STATE;

  const launcher: FakeBrowserLauncher = {
    pageCalls,
    newContextCalls,
    get closedBrowsers() {
      return closedBrowsers;
    },
    launch: () => {
      const context: AuthBrowserContext = {
        newPage: () => Promise.resolve(createFakePage(pageCalls, options)),
        storageState: () => Promise.resolve(storageState),
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
      const browser: AuthBrowser = {
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
