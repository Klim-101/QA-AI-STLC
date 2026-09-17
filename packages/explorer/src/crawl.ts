// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  authenticate,
  systemClock,
  type AuthPage,
  type BrowserLauncher,
  type Clock,
  type StorageState,
} from '@qa-ai-stlc/core';
import {
  SCHEMA_VERSION,
  type DiscoveredRoute,
  type IdentityConfig,
  type RouteMap,
} from '@qa-ai-stlc/schemas';
import { isAllowedUrl, normalizeUrl } from './allowlist.js';
import { extractLinks } from './extract-links.js';
import { buildRequestLogHar, type RequestLogEntry } from './request-log.js';
import { createSafeModeRouteHandler } from './safe-mode.js';

const DEFAULT_MAX_PAGES = 50;

export interface CrawlIdentity {
  readonly config: IdentityConfig;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Required, and only used, when `identity.config.auth` is `"cdp-attach"`. */
  readonly cdpEndpointUrl?: string;
}

export interface CrawlOptions {
  readonly startUrl: string;
  /** Hostnames the crawl may navigate to (development plan section 6.4); a link outside it is dropped. */
  readonly allowlist: readonly string[];
  readonly browserLauncher: BrowserLauncher;
  /** Signs in before crawling, reusing `authenticate()` (P1-05). Omit to crawl anonymously. */
  readonly identity?: CrawlIdentity;
  /** A safety cap on pages visited, independent of how many links are actually reachable. */
  readonly maxPages?: number;
  readonly clock?: Clock;
}

export interface CrawlResult {
  readonly routeMap: RouteMap;
  /** HAR-shaped, redact before registering as `network-har` evidence (development plan section 6.4). */
  readonly requestLogHar: string;
  /** Every non-GET request safe mode intercepted and cancelled; always 0 unless something is broken. */
  readonly blockedRequestCount: number;
}

interface QueueItem {
  readonly url: string;
  readonly discoveredVia: DiscoveredRoute['discoveredVia'];
  readonly discoveredFrom?: string;
}

/**
 * Crawls from `startUrl` by following in-allowlist links only, in safe mode: every non-GET
 * request is intercepted and aborted before it reaches the network (development plan section 6.4
 * — mutation budget zero). Produces a `RouteMap` and a redactable request log, never a live
 * browser or page the caller has to manage.
 */
export async function crawl(options: CrawlOptions): Promise<CrawlResult> {
  const clock = options.clock ?? systemClock;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const storageState = await resolveStorageState(options);

  const browser = await options.browserLauncher.launch();
  try {
    const context = await browser.newContext(storageState === undefined ? {} : { storageState });
    const page = await context.newPage();

    const logEntries: RequestLogEntry[] = [];
    let blockedRequestCount = 0;
    await page.route(
      '**/*',
      createSafeModeRouteHandler((entry) => {
        blockedRequestCount += 1;
        logEntries.push(entry);
      }),
    );

    const routes = await visitAllowedRoutes(page, options, maxPages, logEntries);

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
    };
  } finally {
    await browser.close();
  }
}

async function resolveStorageState(options: CrawlOptions): Promise<StorageState | undefined> {
  if (options.identity === undefined) {
    return undefined;
  }
  return authenticate(options.browserLauncher, options.identity.config, options.identity.env, {
    ...(options.identity.cdpEndpointUrl !== undefined
      ? { cdpEndpointUrl: options.identity.cdpEndpointUrl }
      : {}),
  });
}

async function visitAllowedRoutes(
  page: AuthPage,
  options: CrawlOptions,
  maxPages: number,
  logEntries: RequestLogEntry[],
): Promise<DiscoveredRoute[]> {
  const visited = new Set<string>();
  const routes: DiscoveredRoute[] = [];
  const queue: QueueItem[] = [{ url: options.startUrl, discoveredVia: 'link' }];

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
      for (const link of await extractLinks(page)) {
        if (isAllowedUrl(link, options.allowlist)) {
          queue.push({ url: link, discoveredVia: 'link', discoveredFrom: url });
        }
      }
    }
  }
  return routes;
}
