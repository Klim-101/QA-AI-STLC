// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type {
  AuthBrowser,
  AuthBrowserContext,
  BrowserLauncher,
  LaunchOptions,
} from './ports/browser-launcher.js';

export interface SharedBrowserLauncher extends BrowserLauncher {
  /** Closes every browser `launch()` started; call it once, when the operation is over. */
  dispose(): Promise<void>;
}

// Starting a Chromium costs seconds (about three on a quiet machine, ten when antivirus is busy),
// and an operation that signs in, crawls, analyses and scores pages launched one per step
// (P6-120). Sharing the process keeps the steps isolated, because each still opens contexts of its
// own: cookies and storage never cross from one to the next.
function lendBrowser(browser: AuthBrowser): AuthBrowser {
  const opened: AuthBrowserContext[] = [];
  return {
    newContext: async (options) => {
      const context = await browser.newContext(options);
      opened.push(context);
      return context;
    },
    contexts: () => opened,
    on: (event, handler) => browser.on(event, handler),
    // The caller believes it owns the browser, so closing it must still release what it opened.
    close: async () => {
      await Promise.all(opened.splice(0).map((context) => context.close()));
    },
  };
}

/**
 * Wraps a launcher so that every `launch()` with the same options lends one shared browser. Each
 * lent browser closes only the contexts it opened; `dispose()` closes the real ones. Attaching over
 * CDP is passed through, since that browser belongs to the operator.
 */
export function createSharedBrowserLauncher(launcher: BrowserLauncher): SharedBrowserLauncher {
  const launched: AuthBrowser[] = [];
  const browsersByHeadless = new Map<string, AuthBrowser>();

  return {
    launch: async (options?: LaunchOptions) => {
      const key = String(options?.headless);
      const existing = browsersByHeadless.get(key);
      if (existing !== undefined) {
        return lendBrowser(existing);
      }
      const browser = await launcher.launch(options);
      launched.push(browser);
      browsersByHeadless.set(key, browser);
      return lendBrowser(browser);
    },
    connectOverCdp: (endpointUrl, options) => launcher.connectOverCdp(endpointUrl, options),
    dispose: async () => {
      browsersByHeadless.clear();
      await Promise.all(launched.splice(0).map((browser) => browser.close()));
    },
  };
}
