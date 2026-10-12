// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { AuthBrowserContext, AuthPage } from '@qa-ai-stlc/core';
import { isAllowedUrl, normalizeUrl } from './allowlist.js';
import { settlePage, type PageSettleOptions } from './settle-page.js';

/** A cap, because every probe loads the page again in a context of its own. */
export const DEFAULT_MAX_PROBES_PER_PAGE = 10;

const PROBE_CLICK_TIMEOUT_MS = 2_000;

/**
 * Buttons and `role="link"` elements that cannot submit anything: outside any form, not a submit or
 * reset button, not disabled, and not an anchor with an `href` (the crawl follows those already).
 */
export const PROBE_CONTROL_SELECTOR =
  ':is(button, [role="link"]):not(form *, a[href], [type="submit"], [type="reset"], [disabled], [aria-disabled="true"])';

/**
 * Controls whose name says they end a session or destroy something are never clicked. This is a
 * second line behind safe mode, which already aborts every non-GET request, for the application
 * that does the same thing with a GET. It is English only and not a guarantee (ADR-0015).
 */
export const DENIED_CONTROL_PATTERN =
  '\\b(log ?out|sign ?out|delete|remove|destroy|erase|reset|unsubscribe|deactivate|revoke)\\b';

interface ProbeControlListing {
  readonly selector: string;
  readonly deniedPattern: string;
  readonly limit: number;
}

/* v8 ignore start -- runs in the browser's own V8 instance, invisible to Node coverage */
function listProbeControlIndexes({ selector, deniedPattern, limit }: ProbeControlListing): number[] {
  const denied = new RegExp(deniedPattern, 'i');
  const indexes: number[] = [];
  Array.from(document.querySelectorAll(selector)).forEach((element, index) => {
    const name = [
      element.textContent,
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
    ].join(' ');
    // An invisible control cannot be clicked, so probing it only waits out the click timeout.
    if (element.getClientRects().length > 0 && !denied.test(name)) {
      indexes.push(index);
    }
  });
  return indexes.slice(0, limit);
}
/* v8 ignore stop */

export interface ProbeNavigationOptions {
  /** The crawl's own page, already settled on `pageUrl`; it is only read, never clicked. */
  readonly page: AuthPage;
  readonly pageUrl: string;
  readonly allowlist: readonly string[];
  /**
   * Opens a fresh, isolated browser context with safe mode already installed on it (so a popup is
   * covered too). `onBlocked` is called for every request safe mode aborts in that context.
   */
  readonly openContext: (onBlocked: () => void) => Promise<AuthBrowserContext>;
  readonly settle?: PageSettleOptions;
  readonly maxProbes?: number;
}

export interface NavigationProbeResult {
  /** Where the probed controls led, deduplicated, in the order the controls appear on the page. */
  readonly urls: readonly string[];
  /** How many controls were clicked, whether or not they navigated. */
  readonly probeCount: number;
}

/**
 * Clicks each navigation-only control of a page in a fresh context and keeps where it led (P6-78,
 * ADR-0015). A probe counts only when the page navigated to a different allowlisted URL and safe
 * mode aborted no request during it; the context, with whatever the click changed in it, is then
 * discarded. A control that cannot be clicked, or a page that fails to load in the probe, yields no
 * route and does not stop the others.
 */
export async function probeNavigationControls(
  options: ProbeNavigationOptions,
): Promise<NavigationProbeResult> {
  const indexes = await listProbeControls(options.page, options.maxProbes ?? DEFAULT_MAX_PROBES_PER_PAGE);
  const urls = new Set<string>();
  for (const index of indexes) {
    const landedUrl = await probeControl(options, index);
    if (landedUrl !== undefined) {
      urls.add(landedUrl);
    }
  }
  return { urls: [...urls], probeCount: indexes.length };
}

async function listProbeControls(page: AuthPage, limit: number): Promise<number[]> {
  const result: unknown = await page.evaluate(listProbeControlIndexes, {
    selector: PROBE_CONTROL_SELECTOR,
    deniedPattern: DENIED_CONTROL_PATTERN,
    limit,
  });
  if (!Array.isArray(result)) {
    return [];
  }
  return result.filter((item): item is number => Number.isInteger(item)).slice(0, limit);
}

async function probeControl(options: ProbeNavigationOptions, index: number): Promise<string | undefined> {
  let blockedRequestCount = 0;
  const context = await options.openContext(() => {
    blockedRequestCount += 1;
  });
  try {
    const page = await context.newPage();
    await page.goto(options.pageUrl);
    await settlePage(page, options.pageUrl, options.settle);
    const startUrl = normalizeUrl(page.url());
    await page.click(`${PROBE_CONTROL_SELECTOR} >> nth=${String(index)}`, {
      timeout: PROBE_CLICK_TIMEOUT_MS,
    });
    await settlePage(page, options.pageUrl, options.settle);
    const landedUrl = normalizeUrl(page.url());
    const isKept =
      landedUrl !== startUrl && isAllowedUrl(landedUrl, options.allowlist) && blockedRequestCount === 0;
    return isKept ? landedUrl : undefined;
  } catch {
    // Not clickable, detached by a re-render, or the page failed to load: this control leads nowhere.
    return undefined;
  } finally {
    await context.close();
  }
}
