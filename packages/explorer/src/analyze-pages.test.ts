// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { IdentityConfig } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { analyzePages } from './analyze-pages.js';
import { SYNTHETIC_PROFILE } from './test-support/synthetic-profile.js';
import { createFakeCrawlBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-crawl-browser-launcher';

const EMPTY_ELEMENTS = { interactiveElements: [], forms: [], tables: [], dialogs: [] };
const ALLOWLIST = ['staging.example.com'];
const BASE_URL = 'https://staging.example.com/';

describe('analyzePages', () => {
  it('produces one page model per URL, in order', async () => {
    const browserLauncher = createFakeCrawlBrowserLauncher({
      ariaSnapshotByUrl: {
        'https://staging.example.com/': { role: 'document', name: 'Home' },
        'https://staging.example.com/tasks': { role: 'document', name: 'Tasks' },
      },
      elementsByUrl: {
        'https://staging.example.com/': EMPTY_ELEMENTS,
        'https://staging.example.com/tasks': EMPTY_ELEMENTS,
      },
    });

    const result = await analyzePages({
      urls: ['https://staging.example.com/', 'https://staging.example.com/tasks'],
      allowlist: ALLOWLIST,
      baseUrl: BASE_URL,
      browserLauncher,
      testIdAttribute: 'data-testid',
    });

    expect(result.pageModelSet.pages.map((page) => page.url)).toEqual([
      'https://staging.example.com/',
      'https://staging.example.com/tasks',
    ]);
    expect(result.pageModelSet.pages[0]?.accessibilityTree).toEqual({ role: 'document', name: 'Home' });
    expect(result.blockedRequestCount).toBe(0);
  });

  it('opens the collapsed panels of each page in a context of its own, and counts what it clicked', async () => {
    const urls = ['https://staging.example.com/', 'https://staging.example.com/tasks'];
    const browserLauncher = createFakeCrawlBrowserLauncher({
      ariaSnapshotByUrl: { [urls[0] ?? '']: { role: 'document' }, [urls[1] ?? '']: { role: 'document' } },
      elementsByUrl: { [urls[0] ?? '']: EMPTY_ELEMENTS, [urls[1] ?? '']: EMPTY_ELEMENTS },
      revealRoundsByUrl: { [urls[0] ?? '']: [2, 0], [urls[1] ?? '']: [1, 0] },
    });

    const result = await analyzePages({
      urls,
      allowlist: ALLOWLIST,
      baseUrl: BASE_URL,
      browserLauncher,
      testIdAttribute: 'data-testid',
      revealCollapsed: true,
      settle: {},
      profile: { ...SYNTHETIC_PROFILE, collapsiblePanelSelectors: ['.syn-panel-header'] },
    });

    expect(result.expandedPanelCount).toBe(3);
    expect(result.pageModelSet.pages).toHaveLength(2);
    expect(browserLauncher.newContextCalls).toHaveLength(2);
    expect(browserLauncher.closedContexts).toBe(2);
  });

  it('opens no panel and counts none when it is not asked to', async () => {
    const browserLauncher = createFakeCrawlBrowserLauncher({
      ariaSnapshotByUrl: { 'https://staging.example.com/': { role: 'document' } },
      elementsByUrl: { 'https://staging.example.com/': EMPTY_ELEMENTS },
      revealRoundsByUrl: { 'https://staging.example.com/': [2] },
    });

    const result = await analyzePages({
      urls: ['https://staging.example.com/'],
      allowlist: ALLOWLIST,
      baseUrl: BASE_URL,
      browserLauncher,
      testIdAttribute: 'data-testid',
    });

    expect(result.expandedPanelCount).toBe(0);
    expect(browserLauncher.closedContexts).toBe(0);
  });

  it('crawls anonymously with an empty newContext() call when no identity is given', async () => {
    const browserLauncher = createFakeCrawlBrowserLauncher({
      ariaSnapshotByUrl: { 'https://staging.example.com/': { role: 'document' } },
      elementsByUrl: { 'https://staging.example.com/': EMPTY_ELEMENTS },
    });

    await analyzePages({
      urls: ['https://staging.example.com/'],
      allowlist: ALLOWLIST,
      baseUrl: BASE_URL,
      browserLauncher,
      testIdAttribute: 'data-testid',
    });

    expect(browserLauncher.newContextCalls).toEqual([{}]);
  });

  it('authenticates first and reuses the resulting session when an identity is given', async () => {
    const storageState = { cookies: [], origins: [] };
    const browserLauncher = createFakeCrawlBrowserLauncher({
      authStorageState: storageState,
      ariaSnapshotByUrl: { 'https://staging.example.com/': { role: 'document' } },
      elementsByUrl: { 'https://staging.example.com/': EMPTY_ELEMENTS },
    });
    const identityConfig: IdentityConfig = { auth: 'cdp-attach', secret: 'QA_ADMIN_PASSWORD' };

    await analyzePages({
      urls: ['https://staging.example.com/'],
      allowlist: ALLOWLIST,
      baseUrl: BASE_URL,
      browserLauncher,
      testIdAttribute: 'data-testid',
      identity: { config: identityConfig, env: {}, cdpEndpointUrl: 'http://localhost:9222' },
    });

    expect(browserLauncher.newContextCalls).toEqual([{ storageState }]);
  });

  it('bypasses TLS certificate validation when tlsInsecure is set (P2-18)', async () => {
    const browserLauncher = createFakeCrawlBrowserLauncher({
      ariaSnapshotByUrl: { 'https://staging.example.com/': { role: 'document' } },
      elementsByUrl: { 'https://staging.example.com/': EMPTY_ELEMENTS },
    });

    await analyzePages({
      urls: ['https://staging.example.com/'],
      allowlist: ALLOWLIST,
      baseUrl: BASE_URL,
      browserLauncher,
      testIdAttribute: 'data-testid',
      tlsInsecure: true,
    });

    expect(browserLauncher.newContextCalls).toEqual([{ ignoreHttpsErrors: true }]);
  });

  it('counts a non-GET subrequest safe mode blocks while analyzing a page', async () => {
    const browserLauncher = createFakeCrawlBrowserLauncher({
      ariaSnapshotByUrl: { 'https://staging.example.com/': { role: 'document' } },
      elementsByUrl: { 'https://staging.example.com/': EMPTY_ELEMENTS },
      subRequestsByUrl: {
        'https://staging.example.com/': [{ method: 'POST', url: 'https://staging.example.com/analytics' }],
      },
    });

    const result = await analyzePages({
      urls: ['https://staging.example.com/'],
      allowlist: ALLOWLIST,
      baseUrl: BASE_URL,
      browserLauncher,
      testIdAttribute: 'data-testid',
    });

    expect(result.blockedRequestCount).toBe(1);
  });
});
