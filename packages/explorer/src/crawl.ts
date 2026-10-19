// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  systemClock,
  type AuthBrowserContext,
  type AuthPage,
  type BrowserLauncher,
  type Clock,
  type RouteHandler,
} from '@qa-ai-stlc/core';
import { SCHEMA_VERSION, type DiscoveredRoute, type RouteMap } from '@qa-ai-stlc/schemas';
import { isAllowedUrl, normalizeUrl } from './allowlist.js';
import { extractLinks } from './extract-links.js';
import { extractRouteCandidates, installHistoryCapture } from './extract-route-candidates.js';
import { resolveStorageState, type ExplorerIdentity } from './identity.js';
import { probeNavigationControls } from './probe-navigation.js';
import { buildRequestLogHar, type RequestLogEntry } from './request-log.js';
import { createSafeModeRouteHandler, type SafeModeRequests } from './safe-mode.js';
import { settlePage, type PageSettleOptions } from './settle-page.js';

const DEFAULT_MAX_PAGES = 50;

export type CrawlIdentity = ExplorerIdentity;

export interface CrawlOptions {
  readonly startUrl: string;
  /**
   * Further pages to visit right after `startUrl`, for a page link-following does not reach
   * (P6-77). Each must pass the same allowlist check as any discovered link, or it is dropped.
   */
  readonly startUrls?: readonly string[];
  /** Hostnames the crawl may navigate to (development plan section 6.4); a link outside it is dropped. */
  readonly allowlist: readonly string[];
  readonly browserLauncher: BrowserLauncher;
  /** Signs in before crawling, reusing `authenticate()` (P1-05). Omit to crawl anonymously. */
  readonly identity?: CrawlIdentity;
  /** A safety cap on pages visited, independent of how many links are actually reachable. */
  readonly maxPages?: number;
  readonly clock?: Clock;
  /** Bypasses TLS certificate validation for this crawl (P2-18); off by default. */
  readonly tlsInsecure?: boolean;
  /** The environment's `safeNonGetRequests` and where to tally what safe mode did (ADR-0014). */
  readonly safeMode?: Omit<SafeModeRequests, 'onAllowed'>;
  /** What to wait for after each navigation before the page is read (P6-63). */
  readonly settle?: PageSettleOptions;
  /**
   * Also clicks each page's navigation-only controls in a fresh context to find routes that no
   * link or router attribute declares (P6-78, ADR-0015). Off unless the operator asks for it.
   */
  readonly probeNavigation?: boolean;
  /** Caps the controls clicked per page when `probeNavigation` is on. */
  readonly maxProbesPerPage?: number;
}

export interface CrawlResult {
  readonly routeMap: RouteMap;
  /** HAR-shaped, redact before registering as `network-har` evidence (development plan section 6.4). */
  readonly requestLogHar: string;
  /** Every request safe mode intercepted and cancelled, for its method or for where it went (ADR-0018, ADR-0019). */
  readonly blockedRequestCount: number;
  /** How many controls the navigation probe clicked; 0 unless `probeNavigation` was on. */
  readonly probeCount: number;
}

interface QueueItem {
  readonly url: string;
  readonly discoveredVia: DiscoveredRoute['discoveredVia'];
  readonly discoveredFrom?: string;
}

/**
 * Crawls from `startUrl` by following in-allowlist links, router attributes and History API
 * navigations (and, when asked, probed controls), in safe mode: every non-GET
 * request is intercepted and aborted before it reaches the network (development plan section 6.4
 * — mutation budget zero). Produces a `RouteMap` and a redactable request log, never a live
 * browser or page the caller has to manage.
 */
export async function crawl(options: CrawlOptions): Promise<CrawlResult> {
  const clock = options.clock ?? systemClock;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const storageState = await resolveStorageState(
    options.browserLauncher,
    options.identity,
    options.tlsInsecure,
  );

  const browser = await options.browserLauncher.launch();
  try {
    const context = await browser.newContext({
      ...(storageState === undefined ? {} : { storageState }),
      ...(options.tlsInsecure === true ? { ignoreHttpsErrors: true } : {}),
    });
    const page = await context.newPage();

    const logEntries: RequestLogEntry[] = [];
    let blockedRequestCount = 0;
    const createRouteHandler = (onBlocked: () => void): RouteHandler =>
      createSafeModeRouteHandler(
        options.allowlist,
        options.startUrl,
        (entry) => {
          blockedRequestCount += 1;
          logEntries.push(entry);
          onBlocked();
        },
        { ...options.safeMode, onAllowed: (entry) => logEntries.push(entry) },
      );
    await page.route(
      '**/*',
      createRouteHandler(() => undefined),
    );
    await installHistoryCapture(page);

    // Each probe gets a context of its own, carrying the same session and the same safe-mode
    // handler, so nothing a click changes survives it and a popup it opens is covered as well.
    const openProbeContext = async (onBlocked: () => void): Promise<AuthBrowserContext> => {
      const probeContext = await browser.newContext({
        ...(storageState === undefined ? {} : { storageState }),
        ...(options.tlsInsecure === true ? { ignoreHttpsErrors: true } : {}),
      });
      await probeContext.route('**/*', createRouteHandler(onBlocked));
      return probeContext;
    };

    const { routes, probeCount } = await visitAllowedRoutes(
      page,
      options,
      maxPages,
      logEntries,
      openProbeContext,
    );

    const routeMap: RouteMap = {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: clock.now().toISOString(),
      startUrl: options.startUrl,
      routes,
    };
    return {
      routeMap,
      requestLogHar: buildRequestLogHar(logEntries, routeMap.generatedAt),
      blockedRequestCount,
      probeCount,
    };
  } finally {
    await browser.close();
  }
}

async function visitAllowedRoutes(
  page: AuthPage,
  options: CrawlOptions,
  maxPages: number,
  logEntries: RequestLogEntry[],
  openProbeContext: (onBlocked: () => void) => Promise<AuthBrowserContext>,
): Promise<{ routes: DiscoveredRoute[]; probeCount: number }> {
  let probeCount = 0;
  const visited = new Set<string>();
  const routes: DiscoveredRoute[] = [];
  const queue: QueueItem[] = [options.startUrl, ...(options.startUrls ?? [])].map((url) => ({
    url,
    discoveredVia: 'link',
  }));

  while (queue.length > 0 && visited.size < maxPages) {
    const next = queue.shift();
    // The while condition already guarantees an element; noUncheckedIndexedAccess still types
    // shift()'s result as possibly undefined, so this satisfies the type without being reachable.
    /* v8 ignore next 3 */
    if (next === undefined) {
      break;
    }
    const url = normalizeUrl(next.url);
    if (visited.has(url) || !isAllowedUrl(url, options.allowlist)) {
      continue;
    }
    visited.add(url);

    const response = await page.goto(url);
    const httpStatus = response?.status();
    logEntries.push({
      method: 'GET',
      url,
      blocked: false,
      ...(httpStatus !== undefined ? { status: httpStatus } : {}),
    });
    routes.push({
      url,
      discoveredVia: next.discoveredVia,
      ...(next.discoveredFrom !== undefined ? { discoveredFrom: next.discoveredFrom } : {}),
      ...(httpStatus !== undefined ? { httpStatus } : {}),
    });

    if (httpStatus !== undefined && httpStatus < 400) {
      await settlePage(page, url, options.settle);
      const found: QueueItem[] = (await extractLinks(page)).map((link) => ({
        url: link,
        discoveredVia: 'link',
        discoveredFrom: url,
      }));
      for (const candidate of await extractRouteCandidates(page)) {
        found.push({ url: candidate.url, discoveredVia: candidate.discoveredVia, discoveredFrom: url });
      }
      if (options.probeNavigation === true) {
        const probe = await probeNavigationControls({
          page,
          pageUrl: url,
          allowlist: options.allowlist,
          openContext: openProbeContext,
          ...(options.settle === undefined ? {} : { settle: options.settle }),
          ...(options.maxProbesPerPage === undefined ? {} : { maxProbes: options.maxProbesPerPage }),
        });
        probeCount += probe.probeCount;
        for (const landedUrl of probe.urls) {
          found.push({ url: landedUrl, discoveredVia: 'click-probe', discoveredFrom: url });
        }
      }
      queue.push(...found.filter((item) => isAllowedUrl(item.url, options.allowlist)));
    }
  }
  return { routes, probeCount };
}
