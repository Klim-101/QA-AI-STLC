// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { AuthPage } from '@qa-ai-stlc/core';
import { normalizeUrl } from './allowlist.js';
import { DENIED_CONTROL_PATTERN } from './probe-navigation.js';
import { settlePage, type PageSettleOptions } from './settle-page.js';

/** A cap per page, because every click can render more of the page that then has to be read. */
export const DEFAULT_MAX_EXPANSIONS_PER_PAGE = 20;

// A panel opened by a click can hold another collapsed panel, so a few rounds are made; a control
// that never opens is clicked only once, so the rounds end.
const MAX_ROUNDS = 3;

/**
 * Controls that say they are collapsed (`aria-expanded="false"`) and cannot do anything but open
 * something: no link target, no form submission, no popup. A drop-down or a menu button also reports
 * `aria-expanded="false"` but carries a popup, which is not a panel.
 */
export const COLLAPSED_PANEL_SELECTOR =
  '[aria-expanded="false"]:not(a[href], [type="submit"], [type="reset"], [disabled], [aria-disabled="true"], [role="combobox"], [aria-haspopup]:not([aria-haspopup="false"]), form button:not([type="button"]))';

interface RevealRound {
  readonly selector: string;
  readonly deniedPattern: string;
  readonly limit: number;
}

/* v8 ignore start -- runs in the browser's own V8 instance, invisible to Node coverage */
function clickCollapsedControls({ selector, deniedPattern, limit }: RevealRound): number {
  const denied = new RegExp(deniedPattern, 'i');
  // Remembers what was clicked, so a control that stays collapsed is not clicked again next round.
  const clickedKey = Symbol.for('qa-ai-stlc.revealed-panel');
  const holder = window as unknown as Record<symbol, WeakSet<Element> | undefined>;
  const clicked = (holder[clickedKey] ??= new WeakSet<Element>());
  let count = 0;
  for (const element of Array.from(document.querySelectorAll(selector))) {
    if (count >= limit) {
      break;
    }
    const name = [
      element.textContent,
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
    ].join(' ');
    // An invisible control is not a panel the user can open.
    if (clicked.has(element) || element.getClientRects().length === 0 || denied.test(name)) {
      continue;
    }
    clicked.add(element);
    (element as HTMLElement).click();
    count += 1;
  }
  return count;
}
/* v8 ignore stop */

export interface RevealCollapsedPanelsOptions {
  /** The page's own URL: it is returned to if a click navigated away from it. */
  readonly pageUrl: string;
  /** The component-library profile's `collapsiblePanelSelectors`. */
  readonly extraSelectors?: readonly string[];
  readonly settle?: PageSettleOptions;
  readonly maxExpansions?: number;
}

/**
 * Opens the collapsed panels of the page the caller has just loaded, so the controls inside them
 * are in the DOM to be read (P6-98). Returns how many controls were clicked. The page has to belong
 * to a session that is discarded afterwards, under safe mode: a click can then change nothing that
 * survives it. A click that navigates the page away is undone by loading the page again, and ends the
 * expansion.
 */
export async function revealCollapsedPanels(
  page: AuthPage,
  options: RevealCollapsedPanelsOptions,
): Promise<number> {
  const startUrl = normalizeUrl(page.url());
  const selector = [COLLAPSED_PANEL_SELECTOR, ...(options.extraSelectors ?? [])].join(', ');
  const maxExpansions = options.maxExpansions ?? DEFAULT_MAX_EXPANSIONS_PER_PAGE;
  let clickedCount = 0;
  for (let round = 0; round < MAX_ROUNDS && clickedCount < maxExpansions; round += 1) {
    let clickedInRound: number;
    try {
      clickedInRound = await clickRound(page, selector, maxExpansions - clickedCount);
    } catch {
      // The click navigated, which destroys the page's script context mid-evaluation.
      await page.goto(options.pageUrl);
      await settlePage(page, options.pageUrl, options.settle);
      return clickedCount;
    }
    clickedCount += clickedInRound;
    if (clickedInRound === 0) {
      break;
    }
    await settlePage(page, options.pageUrl, options.settle);
    if (normalizeUrl(page.url()) !== startUrl) {
      await page.goto(options.pageUrl);
      await settlePage(page, options.pageUrl, options.settle);
      return clickedCount;
    }
  }
  return clickedCount;
}

async function clickRound(page: AuthPage, selector: string, limit: number): Promise<number> {
  const result: unknown = await page.evaluate(clickCollapsedControls, {
    selector,
    deniedPattern: DENIED_CONTROL_PATTERN,
    limit,
  });
  return typeof result === 'number' ? result : 0;
}
