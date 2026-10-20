// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  DEFAULT_NORMALIZE_LIMITS,
  systemClock,
  type AuthPage,
  type BrowserLauncher,
  type Clock,
  type NormalizeLimits,
} from '@qa-ai-stlc/core';
import { SCHEMA_VERSION, type PageModel, type PageModelSet } from '@qa-ai-stlc/schemas';
import { analyzePage } from './analyze-page.js';
import type { ComponentLibraryProfile } from './component-library-profile.js';
import { resolveStorageState, type ExplorerIdentity } from './identity.js';
import { revealCollapsedPanels } from './reveal-collapsed-panels.js';
import { assertNotSignedOut } from './sign-in-redirect.js';
import { createSafeModeRouteHandler, type SafeModeRequests } from './safe-mode.js';
import { settlePage, type PageSettleOptions } from './settle-page.js';

export interface AnalyzePagesOptions {
  readonly urls: readonly string[];
  /** Hostnames safe mode may navigate to while analyzing (#306); a redirect off this list is blocked. */
  readonly allowlist: readonly string[];
  /** The environment's configured URL; an allowed request must also share its scheme and port. */
  readonly baseUrl: string;
  readonly browserLauncher: BrowserLauncher;
  /** Signs in before analyzing, reusing `authenticate()` (P1-05). Omit to analyze anonymously. */
  readonly identity?: ExplorerIdentity;
  /** The attribute a crawled element's `testId` is read from (`config.selectors.testIdAttribute`). */
  readonly testIdAttribute: string;
  /** `config.selectors.extraStableAttributes` (P6-23), read off each element when present. */
  readonly extraStableAttributes?: readonly string[];
  /** Profile of `ui.componentLibrary` (P6-37): recognizes widgets and waits for the library to settle. */
  readonly profile?: ComponentLibraryProfile;
  readonly limits?: NormalizeLimits;
  readonly clock?: Clock;
  /** Bypasses TLS certificate validation for this analysis session (P2-18); off by default. */
  readonly tlsInsecure?: boolean;
  /** The environment's `safeNonGetRequests` and where to tally what safe mode did (ADR-0014). */
  readonly safeMode?: SafeModeRequests;
  /** What to wait for after each navigation before the page is read (P6-63). */
  readonly settle?: PageSettleOptions;
  /**
   * Opens the collapsed panels of each page before it is read (P6-98). Each page is then analyzed
   * in a context of its own, discarded afterwards, so nothing a click changed reaches the next page.
   */
  readonly revealCollapsed?: boolean;
}

export interface AnalyzePagesResult {
  readonly pageModelSet: PageModelSet;
  /** Every non-GET request safe mode intercepted and cancelled; always 0 unless something is broken. */
  readonly blockedRequestCount: number;
  /** How many collapsed-panel controls were clicked; 0 unless `revealCollapsed` was on. */
  readonly expandedPanelCount: number;
}

/**
 * Analyzes every URL in `urls` — typically a crawl's `RouteMap.routes` — in one browser session,
 * in safe mode (development plan section 6.3 step 3): navigating for analysis never sends a
 * non-GET request either. Produces one `PageModel` per URL, in the given order.
 */
export async function analyzePages(options: AnalyzePagesOptions): Promise<AnalyzePagesResult> {
  const clock = options.clock ?? systemClock;
  const limits = options.limits ?? DEFAULT_NORMALIZE_LIMITS;
  let sessionState = await resolveStorageState(
    options.browserLauncher,
    options.identity,
    { allowlist: options.allowlist, baseUrl: options.baseUrl },
    options.tlsInsecure,
  );

  const browser = await options.browserLauncher.launch();
  try {
    let blockedRequestCount = 0;
    // Safe mode is installed on the context, not the page, so a popup a click opens is covered too.
    const openSession = async (): Promise<{ page: AuthPage; close: () => Promise<void> }> => {
      const context = await browser.newContext({
        ...(sessionState === undefined ? {} : { storageState: sessionState }),
        ...(options.tlsInsecure === true ? { ignoreHttpsErrors: true } : {}),
      });
      await context.route(
        '**/*',
        createSafeModeRouteHandler(
          options.allowlist,
          options.baseUrl,
          () => {
            blockedRequestCount += 1;
          },
          options.safeMode,
        ),
      );
      return {
        page: await context.newPage(),
        close: async () => {
          // An application that rotates its session token on use hands the next context a dead one
          // unless the state the previous context ended with is carried forward.
          sessionState = await context.storageState();
          await context.close();
        },
      };
    };

    const revealCollapsed = options.revealCollapsed === true;
    const sharedSession = revealCollapsed ? undefined : await openSession();
    const pages: PageModel[] = [];
    let expandedPanelCount = 0;
    for (const url of options.urls) {
      const session = sharedSession ?? (await openSession());
      try {
        const { page } = session;
        await page.goto(url);
        await settlePage(page, url, options.settle);
        if (revealCollapsed) {
          assertNotSignedOut(page, url, options.identity);
          expandedPanelCount += await revealCollapsedPanels(page, {
            pageUrl: url,
            ...(options.profile?.collapsiblePanelSelectors === undefined
              ? {}
              : { extraSelectors: options.profile.collapsiblePanelSelectors }),
            ...(options.settle === undefined ? {} : { settle: options.settle }),
          });
          assertNotSignedOut(page, url, options.identity);
        }
        pages.push(
          await analyzePage(
            page,
            url,
            options.testIdAttribute,
            limits,
            options.extraStableAttributes ?? [],
            options.profile,
          ),
        );
      } finally {
        if (sharedSession === undefined) {
          await session.close();
        }
      }
    }

    const pageModelSet: PageModelSet = {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: clock.now().toISOString(),
      pages,
    };
    return { pageModelSet, blockedRequestCount, expandedPanelCount };
  } finally {
    await browser.close();
  }
}
