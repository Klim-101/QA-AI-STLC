// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type {
  AuthBrowser,
  AuthBrowserContext,
  AuthPage,
  BrowserLauncher,
  StorageState,
} from '../ports/browser-launcher.js';

const EMPTY_STORAGE_STATE: StorageState = { cookies: [], origins: [] };

export interface FakePageCall {
  readonly method: 'goto' | 'fill' | 'click' | 'waitForLoadState';
  readonly args: readonly unknown[];
}

export interface FakeBrowserLauncherOptions {
  readonly storageState?: StorageState;
  readonly contexts?: readonly AuthBrowserContext[];
}

export interface FakeBrowserLauncher extends BrowserLauncher {
  readonly pageCalls: FakePageCall[];
  readonly closedBrowsers: number;
}

function createFakePage(calls: FakePageCall[]): AuthPage {
  return {
    goto: (...args) => {
      calls.push({ method: 'goto', args });
      return Promise.resolve(undefined);
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
  };
}

/** A fake `BrowserLauncher` for unit tests: no real browser is ever launched (AGENTS.md 5.3, 13). */
export function createFakeBrowserLauncher(options: FakeBrowserLauncherOptions = {}): FakeBrowserLauncher {
  const pageCalls: FakePageCall[] = [];
  let closedBrowsers = 0;
  const storageState = options.storageState ?? EMPTY_STORAGE_STATE;

  const launcher: FakeBrowserLauncher = {
    pageCalls,
    get closedBrowsers() {
      return closedBrowsers;
    },
    launch: () => {
      const context: AuthBrowserContext = {
        newPage: () => Promise.resolve(createFakePage(pageCalls)),
        storageState: () => Promise.resolve(storageState),
        close: () => Promise.resolve(),
      };
      const browser: AuthBrowser = {
        newContext: () => Promise.resolve(context),
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
