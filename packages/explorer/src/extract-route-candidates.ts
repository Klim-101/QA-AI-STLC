// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { AuthPage } from '@qa-ai-stlc/core';
import type { RouteDiscoveryMethod } from '@qa-ai-stlc/schemas';

/** A route a single-page application declares without an `<a href>`, found without clicking anything. */
export interface RouteCandidate {
  readonly url: string;
  readonly discoveredVia: Extract<RouteDiscoveryMethod, 'router-attribute' | 'history-api'>;
}

const MAX_RAW_VALUES = 500;
const MAX_RAW_VALUE_LENGTH = 2_048;

/**
 * Installed before any script of the page runs, so a URL the application pushes while it boots is
 * not missed. The wrappers only record the argument and call the original, and the recorded list is
 * capped; the page's own behaviour is unchanged. Everything recorded is page-controlled and is
 * treated as untrusted by the reader below.
 */
export const HISTORY_CAPTURE_SCRIPT = `(() => {
  if (window.__qaHistoryUrls !== undefined) {
    return;
  }
  const urls = [];
  Object.defineProperty(window, '__qaHistoryUrls', { value: urls });
  for (const name of ['pushState', 'replaceState']) {
    const original = history[name];
    history[name] = function (state, title, url) {
      if (url !== undefined && url !== null && urls.length < ${String(MAX_RAW_VALUES)}) {
        try {
          urls.push(new URL(String(url), location.href).href);
        } catch {
          // A malformed URL makes the original call throw as well; there is nothing to record.
        }
      }
      return original.apply(this, arguments);
    };
  }
})();`;

/* v8 ignore start -- these run in the browser's own V8 instance, invisible to Node coverage */
function readRouteAttributeValues(): string[] {
  const names = ['routerlink', 'ng-reflect-router-link', 'data-href'];
  const values: string[] = [];
  for (const element of Array.from(document.querySelectorAll(names.map((name) => `[${name}]`).join(',')))) {
    for (const name of names) {
      const value = element.getAttribute(name);
      if (value !== null) {
        values.push(value);
      }
    }
  }
  return values;
}

function readCapturedHistoryUrls(): string[] {
  const captured = (window as unknown as { __qaHistoryUrls?: string[] }).__qaHistoryUrls;
  return captured === undefined ? [] : Array.from(captured);
}
/* v8 ignore stop */

/** Registers history capture on `page` for every document it loads; call before the first `goto`. */
export async function installHistoryCapture(page: AuthPage): Promise<void> {
  await page.addInitScript({ content: HISTORY_CAPTURE_SCRIPT });
}

/**
 * Turns a router attribute value into an absolute http(s) URL, or `undefined` when it is not one.
 * Angular renders an array binding as `ng-reflect-router-link="/nodes,5"`, so a comma-separated
 * value is joined into a path. A relative value resolves against `pageUrl`, which is Angular's
 * rule only for a route-relative link, but it is the best a page without a click can offer.
 */
export function resolveRouteAttributeValue(value: string, pageUrl: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }
  const path = trimmed.includes(',')
    ? trimmed
        .split(',')
        .map((segment) => segment.trim())
        .filter((segment) => segment !== '')
        .join('/')
        .replace(/\/{2,}/g, '/')
    : trimmed;
  return toHttpUrl(path, pageUrl);
}

function toHttpUrl(value: string, base: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return undefined;
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
}

function toStrings(result: unknown): string[] {
  if (!Array.isArray(result)) {
    return [];
  }
  return result
    .filter((item): item is string => typeof item === 'string' && item.length <= MAX_RAW_VALUE_LENGTH)
    .slice(0, MAX_RAW_VALUES);
}

/**
 * Reads the routes the current page declares without a link: router attributes (`routerLink`,
 * `ng-reflect-router-link`, `data-href`) and URLs pushed through the History API since the page
 * loaded (needs `installHistoryCapture`). Nothing is clicked; the caller still applies the domain
 * allowlist to each URL, as it does to a link.
 */
export async function extractRouteCandidates(page: AuthPage): Promise<readonly RouteCandidate[]> {
  const pageUrl = page.url();
  const attributeValues = toStrings(await page.evaluate(readRouteAttributeValues));
  const historyUrls = toStrings(await page.evaluate(readCapturedHistoryUrls));

  const candidates: RouteCandidate[] = [];
  for (const value of attributeValues) {
    const url = resolveRouteAttributeValue(value, pageUrl);
    if (url !== undefined) {
      candidates.push({ url, discoveredVia: 'router-attribute' });
    }
  }
  for (const value of historyUrls) {
    const url = toHttpUrl(value, pageUrl);
    if (url !== undefined) {
      candidates.push({ url, discoveredVia: 'history-api' });
    }
  }
  return candidates;
}
