// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { IdentityConfig } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { crawl } from './crawl.js';
import { createFakeCrawlBrowserLauncher } from './test-support/fake-browser-launcher.js';

describe('crawl', () => {
  it('follows in-allowlist links and drops one outside it', async () => {
    const browserLauncher = createFakeCrawlBrowserLauncher({
      linksByUrl: {
        'https://staging.example.com/': ['https://staging.example.com/tasks', 'https://evil.example.com/'],
      },
    });

    const result = await crawl({
      startUrl: 'https://staging.example.com/',
      allowlist: ['staging.example.com'],
      browserLauncher,
    });

    expect(result.routeMap.routes).toEqual([
      { url: 'https://staging.example.com/', discoveredVia: 'link', httpStatus: 200 },
      {
        url: 'https://staging.example.com/tasks',
        discoveredVia: 'link',
        discoveredFrom: 'https://staging.example.com/',
        httpStatus: 200,
      },
    ]);
    expect(result.blockedRequestCount).toBe(0);
    expect(browserLauncher.closedBrowsers).toBe(1);
  });

  it('never revisits a URL reachable through a cycle', async () => {
    const browserLauncher = createFakeCrawlBrowserLauncher({
      linksByUrl: {
        'https://staging.example.com/': ['https://staging.example.com/tasks'],
        'https://staging.example.com/tasks': ['https://staging.example.com/'],
      },
    });

    const result = await crawl({
      startUrl: 'https://staging.example.com/',
      allowlist: ['staging.example.com'],
      browserLauncher,
    });

    expect(result.routeMap.routes.map((route) => route.url)).toEqual([
      'https://staging.example.com/',
      'https://staging.example.com/tasks',
    ]);
  });

  it('stops link extraction on a page that responded with an error status', async () => {
    const browserLauncher = createFakeCrawlBrowserLauncher({
      responsesByUrl: { 'https://staging.example.com/broken': { status: () => 404 } },
      linksByUrl: { 'https://staging.example.com/broken': ['https://staging.example.com/unreachable'] },
    });

    const result = await crawl({
      startUrl: 'https://staging.example.com/broken',
      allowlist: ['staging.example.com'],
      browserLauncher,
    });

    expect(result.routeMap.routes).toEqual([
      { url: 'https://staging.example.com/broken', discoveredVia: 'link', httpStatus: 404 },
    ]);
  });

  it('records no route when goto resolves to null', async () => {
    const browserLauncher = createFakeCrawlBrowserLauncher({
      responsesByUrl: { 'https://staging.example.com/': null },
    });

    const result = await crawl({
      startUrl: 'https://staging.example.com/',
      allowlist: ['staging.example.com'],
      browserLauncher,
    });

    expect(result.routeMap.routes).toEqual([{ url: 'https://staging.example.com/', discoveredVia: 'link' }]);
  });

  it('caps the crawl at maxPages', async () => {
    const browserLauncher = createFakeCrawlBrowserLauncher({
      linksByUrl: {
        'https://staging.example.com/': ['https://staging.example.com/tasks'],
        'https://staging.example.com/tasks': ['https://staging.example.com/admin'],
      },
    });

    const result = await crawl({
      startUrl: 'https://staging.example.com/',
      allowlist: ['staging.example.com'],
      browserLauncher,
      maxPages: 1,
    });

    expect(result.routeMap.routes).toHaveLength(1);
  });

  it('authenticates before crawling when an identity is given, and reuses its session', async () => {
    const storageState = { cookies: [], origins: [] };
    const browserLauncher = createFakeCrawlBrowserLauncher({ authStorageState: storageState });
    const identityConfig: IdentityConfig = { auth: 'cdp-attach', secret: 'QA_ADMIN_PASSWORD' };

    await crawl({
      startUrl: 'https://staging.example.com/',
      allowlist: ['staging.example.com'],
      browserLauncher,
      identity: { config: identityConfig, env: {}, cdpEndpointUrl: 'http://localhost:9222' },
    });

    expect(browserLauncher.newContextCalls).toEqual([{ storageState }]);
  });

  it('signs in with scripted credentials before crawling', async () => {
    const browserLauncher = createFakeCrawlBrowserLauncher();
    const identityConfig: IdentityConfig = {
      auth: 'storage-state',
      secret: 'QA_ADMIN_PASSWORD',
      loginUrl: 'https://staging.example.com/login',
      username: 'admin@example.com',
    };

    await crawl({
      startUrl: 'https://staging.example.com/',
      allowlist: ['staging.example.com'],
      browserLauncher,
      identity: { config: identityConfig, env: { QA_ADMIN_PASSWORD: 'secret' } },
    });

    expect(browserLauncher.page.gotoUrls).toContain('https://staging.example.com/login');
  });

  it('continues an allowed GET subrequest and blocks a non-GET one on the same page', async () => {
    const browserLauncher = createFakeCrawlBrowserLauncher({
      subRequestsByUrl: {
        'https://staging.example.com/': [
          { method: 'GET', url: 'https://staging.example.com/style.css' },
          { method: 'POST', url: 'https://staging.example.com/analytics' },
        ],
      },
    });

    const result = await crawl({
      startUrl: 'https://staging.example.com/',
      allowlist: ['staging.example.com'],
      browserLauncher,
    });

    expect(result.blockedRequestCount).toBe(1);
    const har = JSON.parse(result.requestLogHar) as {
      log: { entries: { blocked: boolean; request: { method: string } }[] };
    };
    expect(har.log.entries.some((entry) => entry.blocked && entry.request.method === 'POST')).toBe(true);
  });

  it('blocks a GET subrequest off the domain allowlist even though it is not a queued link (regression, #306)', async () => {
    const browserLauncher = createFakeCrawlBrowserLauncher({
      subRequestsByUrl: {
        'https://staging.example.com/': [{ method: 'GET', url: 'https://evil.example.com/tracker.js' }],
      },
    });

    const result = await crawl({
      startUrl: 'https://staging.example.com/',
      allowlist: ['staging.example.com'],
      browserLauncher,
    });

    expect(result.blockedRequestCount).toBe(1);
    const har = JSON.parse(result.requestLogHar) as {
      log: { entries: { blocked: boolean; request: { url: string } }[] };
    };
    expect(
      har.log.entries.some((entry) => entry.blocked && entry.request.url.includes('evil.example.com')),
    ).toBe(true);
  });

  it('crawls anonymously with an empty newContext() call when no identity is given', async () => {
    const browserLauncher = createFakeCrawlBrowserLauncher();

    await crawl({
      startUrl: 'https://staging.example.com/',
      allowlist: ['staging.example.com'],
      browserLauncher,
    });

    expect(browserLauncher.newContextCalls).toEqual([{}]);
  });
});
