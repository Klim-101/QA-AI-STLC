// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { IdentityConfig } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { crawl } from './crawl.js';
import { createFakeCrawlBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-crawl-browser-launcher';

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

  it('visits operator-given start URLs after the base URL, and drops one outside the allowlist (P6-77)', async () => {
    const browserLauncher = createFakeCrawlBrowserLauncher({
      linksByUrl: { 'https://staging.example.com/': ['https://staging.example.com/tasks'] },
    });

    const result = await crawl({
      startUrl: 'https://staging.example.com/',
      startUrls: [
        'https://staging.example.com/nodes/monitor',
        'https://evil.example.com/',
        'https://staging.example.com/tasks',
      ],
      allowlist: ['staging.example.com'],
      browserLauncher,
    });

    expect(result.routeMap.routes.map((route) => route.url)).toEqual([
      'https://staging.example.com/',
      'https://staging.example.com/nodes/monitor',
      'https://staging.example.com/tasks',
    ]);
    expect(result.routeMap.routes[1]).not.toHaveProperty('discoveredFrom');
  });

  it('finds routes a page declares without a link, and records how (P6-78)', async () => {
    const browserLauncher = createFakeCrawlBrowserLauncher({
      routeAttributeValuesByUrl: {
        'https://staging.example.com/': ['/overview', 'https://evil.example.com/x'],
      },
      historyUrlsByUrl: { 'https://staging.example.com/': ['https://staging.example.com/pushed'] },
      linksByUrl: { 'https://staging.example.com/': ['https://staging.example.com/overview'] },
    });

    const result = await crawl({
      startUrl: 'https://staging.example.com/',
      allowlist: ['staging.example.com'],
      browserLauncher,
    });

    expect(result.routeMap.routes.map((route) => [route.url, route.discoveredVia])).toEqual([
      ['https://staging.example.com/', 'link'],
      ['https://staging.example.com/overview', 'link'],
      ['https://staging.example.com/pushed', 'history-api'],
    ]);
    expect(browserLauncher.page.initScripts).toHaveLength(1);
    expect(result.probeCount).toBe(0);
    expect(browserLauncher.newContextCalls).toHaveLength(1);
  });

  it('records a router attribute as the way a route was found when no link points to it (P6-78)', async () => {
    const browserLauncher = createFakeCrawlBrowserLauncher({
      routeAttributeValuesByUrl: { 'https://staging.example.com/': ['/overview'] },
    });

    const result = await crawl({
      startUrl: 'https://staging.example.com/',
      allowlist: ['staging.example.com'],
      browserLauncher,
    });

    expect(result.routeMap.routes[1]).toEqual({
      url: 'https://staging.example.com/overview',
      discoveredVia: 'router-attribute',
      discoveredFrom: 'https://staging.example.com/',
      httpStatus: 200,
    });
  });

  describe('navigation probing (P6-78, ADR-0015)', () => {
    const START = 'https://staging.example.com/';

    it('clicks no control unless asked to', async () => {
      const browserLauncher = createFakeCrawlBrowserLauncher({
        probeControlIndexesByUrl: { [START]: [0] },
        clickResultsByUrl: { [START]: { 0: { url: 'https://staging.example.com/nodes' } } },
      });

      const result = await crawl({ startUrl: START, allowlist: ['staging.example.com'], browserLauncher });

      expect(result.routeMap.routes).toHaveLength(1);
      expect(result.probeCount).toBe(0);
    });

    it('visits a page a probed control led to, and keeps probing from it', async () => {
      const browserLauncher = createFakeCrawlBrowserLauncher({
        probeControlIndexesByUrl: { [START]: [0], 'https://staging.example.com/nodes': [0] },
        clickResultsByUrl: {
          [START]: { 0: { url: 'https://staging.example.com/nodes' } },
          'https://staging.example.com/nodes': { 0: { url: 'https://staging.example.com/nodes/detail' } },
        },
      });

      const result = await crawl({
        startUrl: START,
        allowlist: ['staging.example.com'],
        browserLauncher,
        probeNavigation: true,
        maxProbesPerPage: 3,
      });

      expect(result.routeMap.routes.map((route) => [route.url, route.discoveredVia])).toEqual([
        [START, 'link'],
        ['https://staging.example.com/nodes', 'click-probe'],
        ['https://staging.example.com/nodes/detail', 'click-probe'],
      ]);
      expect(result.routeMap.routes[1]?.discoveredFrom).toBe(START);
      expect(result.probeCount).toBe(2);
      expect(browserLauncher.closedContexts).toBe(2);
    });

    it('probes under safe mode: a request the click makes is aborted, counted, and costs the route', async () => {
      const browserLauncher = createFakeCrawlBrowserLauncher({
        probeControlIndexesByUrl: { [START]: [0] },
        clickResultsByUrl: {
          [START]: {
            0: {
              url: 'https://staging.example.com/nodes',
              subRequests: [{ method: 'DELETE', url: 'https://staging.example.com/api/nodes/1' }],
            },
          },
        },
      });

      const result = await crawl({
        startUrl: START,
        allowlist: ['staging.example.com'],
        browserLauncher,
        probeNavigation: true,
      });

      expect(result.routeMap.routes).toHaveLength(1);
      expect(result.blockedRequestCount).toBe(1);
      const har = JSON.parse(result.requestLogHar) as { log: { entries: { blocked: boolean }[] } };
      expect(har.log.entries.some((entry) => entry.blocked)).toBe(true);
    });

    it('gives each probe the identity session and the TLS setting of the crawl', async () => {
      const browserLauncher = createFakeCrawlBrowserLauncher({
        probeControlIndexesByUrl: { [START]: [0] },
      });

      await crawl({
        startUrl: START,
        allowlist: ['staging.example.com'],
        browserLauncher,
        probeNavigation: true,
        tlsInsecure: true,
      });

      expect(browserLauncher.newContextCalls).toEqual([
        { ignoreHttpsErrors: true },
        { ignoreHttpsErrors: true },
      ]);
    });

    it('carries the stored session into a probe context', async () => {
      const storageState = { cookies: [], origins: [] };
      const browserLauncher = createFakeCrawlBrowserLauncher({
        authStorageState: storageState,
        probeControlIndexesByUrl: { [START]: [0] },
      });
      const identityConfig: IdentityConfig = { auth: 'cdp-attach', secret: 'QA_ADMIN_PASSWORD' };

      await crawl({
        startUrl: START,
        allowlist: ['staging.example.com'],
        browserLauncher,
        probeNavigation: true,
        identity: { config: identityConfig, env: {}, cdpEndpointUrl: 'http://localhost:9222' },
      });

      expect(browserLauncher.newContextCalls).toEqual([{ storageState }, { storageState }]);
    });
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

  it('asks for the environment locale in every context it opens (P6-114)', async () => {
    const browserLauncher = createFakeCrawlBrowserLauncher({
      probeControlIndexesByUrl: { 'https://staging.example.com/': [0] },
    });
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
      probeNavigation: true,
      identity: { config: identityConfig, env: { QA_ADMIN_PASSWORD: 'secret' } },
      locale: 'es-ES',
    });

    expect(browserLauncher.newContextCalls.map((call) => call.locale)).toEqual(['es-ES', 'es-ES', 'es-ES']);
  });

  it('bypasses TLS certificate validation when tlsInsecure is set (P2-18)', async () => {
    const browserLauncher = createFakeCrawlBrowserLauncher();

    await crawl({
      startUrl: 'https://staging.example.com/',
      allowlist: ['staging.example.com'],
      browserLauncher,
      tlsInsecure: true,
    });

    expect(browserLauncher.newContextCalls).toEqual([{ ignoreHttpsErrors: true }]);
  });

  it('bypasses TLS validation for the scripted login session too when tlsInsecure is set (P2-18)', async () => {
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
      tlsInsecure: true,
    });

    expect(browserLauncher.newContextCalls).toEqual([
      { ignoreHttpsErrors: true },
      { storageState: { cookies: [], origins: [] }, ignoreHttpsErrors: true },
    ]);
  });
});
