// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { AuthPage } from '@qa-ai-stlc/core';

/** How long a page gets to settle before explore reads it anyway; short, because it is paid per page. */
export const DEFAULT_SETTLE_TIMEOUT_MS = 10_000;

/** How long the page's DOM must stay unchanged to count as rendered. */
export const DEFAULT_SETTLE_QUIET_MS = 500;

export interface PageSettleOptions {
  /** Busy indicators (`ui.busySelectors` and the component library's) that must be gone. */
  readonly busySelectors?: readonly string[];
  readonly timeoutMs?: number;
  /** Called with the page URL when it did not settle in time; the page is then read as it is. */
  readonly onUnsettled?: (url: string) => void;
}

interface SettleArgs {
  readonly busySelectors: readonly string[];
  readonly timeoutMs: number;
  readonly quietMs: number;
}

/* v8 ignore start -- runs in the browser's own V8 instance, invisible to Node coverage */
function waitForRender({ busySelectors, timeoutMs, quietMs }: SettleArgs): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    let lastMutationAt = Date.now();
    const observer = new MutationObserver(() => {
      lastMutationAt = Date.now();
    });
    observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    // A single-page application's root element exists before anything is rendered into it, so an
    // empty page is not settled: something readable or operable has to be there.
    const hasContent = (): boolean =>
      document.body.innerText.trim().length > 0 ||
      document.body.querySelector('a, button, input, select, textarea, canvas, svg, img') !== null;
    const isBusy = (): boolean => busySelectors.some((selector) => document.querySelector(selector) !== null);
    const check = (): void => {
      const now = Date.now();
      if (hasContent() && !isBusy() && now - lastMutationAt >= quietMs) {
        observer.disconnect();
        resolve(true);
        return;
      }
      if (now >= deadline) {
        observer.disconnect();
        resolve(false);
        return;
      }
      setTimeout(check, 50);
    };
    check();
  });
}
/* v8 ignore stop */

async function evaluateSettle(page: AuthPage, args: SettleArgs): Promise<boolean> {
  return (await page.evaluate(waitForRender, args)) === true;
}

/**
 * Waits for a freshly loaded page to finish rendering: content present, no busy indicator, and the
 * DOM quiet for a moment. `page.goto` resolves on the load event, which a single-page application
 * reaches before it has rendered anything, so reading the page right after it finds nothing.
 * Returns false (and reports through `onUnsettled`) when the timeout passes first: a spinner that
 * never leaves, or a page that keeps changing, must not block exploration of the rest of the app.
 */
export async function settlePage(
  page: AuthPage,
  url: string,
  options: PageSettleOptions = {},
): Promise<boolean> {
  const args: SettleArgs = {
    busySelectors: options.busySelectors ?? [],
    timeoutMs: options.timeoutMs ?? DEFAULT_SETTLE_TIMEOUT_MS,
    quietMs: DEFAULT_SETTLE_QUIET_MS,
  };
  let settled: boolean;
  try {
    settled = await evaluateSettle(page, args);
  } catch {
    // The page navigated while it was being watched (a redirect after load destroys the execution
    // context); look again at wherever it ended up.
    try {
      await page.waitForLoadState('load');
      settled = await evaluateSettle(page, args);
    } catch {
      // Still navigating: reported as unsettled below rather than failing the whole exploration.
      settled = false;
    }
  }
  if (!settled) {
    options.onUnsettled?.(url);
  }
  return settled;
}
