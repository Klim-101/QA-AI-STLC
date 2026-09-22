// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { IdentityConfig } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { analyzePages } from './analyze-pages.js';
import { createFakeCrawlBrowserLauncher } from './test-support/fake-browser-launcher.js';

const EMPTY_ELEMENTS = { interactiveElements: [], forms: [], tables: [], dialogs: [] };
const ALLOWLIST = ['staging.example.com'];

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
      browserLauncher,
    });

    expect(result.pageModelSet.pages.map((page) => page.url)).toEqual([
      'https://staging.example.com/',
      'https://staging.example.com/tasks',
    ]);
    expect(result.pageModelSet.pages[0]?.accessibilityTree).toEqual({ role: 'document', name: 'Home' });
    expect(result.blockedRequestCount).toBe(0);
  });

  it('crawls anonymously with an empty newContext() call when no identity is given', async () => {
    const browserLauncher = createFakeCrawlBrowserLauncher({
      ariaSnapshotByUrl: { 'https://staging.example.com/': { role: 'document' } },
      elementsByUrl: { 'https://staging.example.com/': EMPTY_ELEMENTS },
    });

    await analyzePages({ urls: ['https://staging.example.com/'], allowlist: ALLOWLIST, browserLauncher });

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
      browserLauncher,
      identity: { config: identityConfig, env: {}, cdpEndpointUrl: 'http://localhost:9222' },
    });

    expect(browserLauncher.newContextCalls).toEqual([{ storageState }]);
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
      browserLauncher,
    });

    expect(result.blockedRequestCount).toBe(1);
  });
});
