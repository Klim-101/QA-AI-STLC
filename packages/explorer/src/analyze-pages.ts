// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { systemClock, type BrowserLauncher, type Clock } from '@qa-ai-stlc/core';
import { SCHEMA_VERSION, type PageModel, type PageModelSet } from '@qa-ai-stlc/schemas';
import { analyzePage } from './analyze-page.js';
import { resolveStorageState, type ExplorerIdentity } from './identity.js';
import { DEFAULT_NORMALIZE_LIMITS, type NormalizeLimits } from './normalize.js';
import { createSafeModeRouteHandler } from './safe-mode.js';

export interface AnalyzePagesOptions {
  readonly urls: readonly string[];
  /** Hostnames safe mode may navigate to while analyzing (#306); a redirect off this list is blocked. */
  readonly allowlist: readonly string[];
  readonly browserLauncher: BrowserLauncher;
  /** Signs in before analyzing, reusing `authenticate()` (P1-05). Omit to analyze anonymously. */
  readonly identity?: ExplorerIdentity;
  readonly limits?: NormalizeLimits;
  readonly clock?: Clock;
}

export interface AnalyzePagesResult {
  readonly pageModelSet: PageModelSet;
  /** Every non-GET request safe mode intercepted and cancelled; always 0 unless something is broken. */
  readonly blockedRequestCount: number;
}

/**
 * Analyzes every URL in `urls` — typically a crawl's `RouteMap.routes` — in one browser session,
 * in safe mode (development plan section 6.3 step 3): navigating for analysis never sends a
 * non-GET request either. Produces one `PageModel` per URL, in the given order.
 */
export async function analyzePages(options: AnalyzePagesOptions): Promise<AnalyzePagesResult> {
  const clock = options.clock ?? systemClock;
  const limits = options.limits ?? DEFAULT_NORMALIZE_LIMITS;
  const storageState = await resolveStorageState(options.browserLauncher, options.identity);

  const browser = await options.browserLauncher.launch();
  try {
    const context = await browser.newContext(storageState === undefined ? {} : { storageState });
    const page = await context.newPage();
    let blockedRequestCount = 0;
    await page.route(
      '**/*',
      createSafeModeRouteHandler(options.allowlist, () => {
        blockedRequestCount += 1;
      }),
    );

    const pages: PageModel[] = [];
    for (const url of options.urls) {
      await page.goto(url);
      pages.push(await analyzePage(page, url, limits));
    }

    const pageModelSet: PageModelSet = {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: clock.now().toISOString(),
      pages,
    };
    return { pageModelSet, blockedRequestCount };
  } finally {
    await browser.close();
  }
}
