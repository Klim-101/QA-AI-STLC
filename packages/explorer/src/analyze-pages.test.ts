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
const IDENTITY_WITH_LOGIN: IdentityConfig = {
  auth: 'cdp-attach',
  secret: 'QA_ADMIN_PASSWORD',
  loginUrl: 'https://staging.example.com/login',
};

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

  it('opens each context from the state the previous one ended with, so a rotated token is not lost', async () => {
    const urls = [
      'https://staging.example.com/a',
      'https://staging.example.com/b',
      'https://staging.example.com/c',
    ];
    const initial = { cookies: [{ name: 'refresh', value: 'token-0' }], origins: [] };
    const afterFirst = { cookies: [{ name: 'refresh', value: 'token-1' }], origins: [] };
    const afterSecond = { cookies: [{ name: 'refresh', value: 'token-2' }], origins: [] };
    const browserLauncher = createFakeCrawlBrowserLauncher({
      authStorageState: initial,
      contextStorageStates: [afterFirst, afterSecond],
      ariaSnapshotByUrl: Object.fromEntries(urls.map((url) => [url, { role: 'document' }])),
      elementsByUrl: Object.fromEntries(urls.map((url) => [url, EMPTY_ELEMENTS])),
    });

    await analyzePages({
      urls,
      allowlist: ALLOWLIST,
      baseUrl: BASE_URL,
      browserLauncher,
      testIdAttribute: 'data-testid',
      revealCollapsed: true,
      identity: { config: IDENTITY_WITH_LOGIN, env: {}, cdpEndpointUrl: 'http://localhost:9222' },
    });

    expect(browserLauncher.newContextCalls.map((call) => call.storageState)).toEqual([
      initial,
      afterFirst,
      afterSecond,
    ]);
  });

  it('carries the state a page loaded with, not what opening its panels changed (P6-116)', async () => {
    const urls = ['https://staging.example.com/a', 'https://staging.example.com/b'];
    const loaded = { cookies: [{ name: 'refresh', value: 'token-1' }], origins: [] };
    const afterClicks = {
      cookies: [{ name: 'refresh', value: 'token-1' }],
      origins: [{ origin: 'https://staging.example.com', localStorage: [{ name: 'filter', value: 'open' }] }],
    };
    const browserLauncher = createFakeCrawlBrowserLauncher({
      contextStorageStates: [loaded],
      contextStorageStatesAfterReveal: [afterClicks],
      revealRoundsByUrl: { [urls[0] ?? '']: [2] },
      ariaSnapshotByUrl: Object.fromEntries(urls.map((url) => [url, { role: 'document' }])),
      elementsByUrl: Object.fromEntries(urls.map((url) => [url, EMPTY_ELEMENTS])),
    });

    await analyzePages({
      urls,
      allowlist: ALLOWLIST,
      baseUrl: BASE_URL,
      browserLauncher,
      testIdAttribute: 'data-testid',
      revealCollapsed: true,
    });

    expect(browserLauncher.newContextCalls[1]?.storageState).toEqual(loaded);
  });

  it('stops with EXPLORE_SIGNED_OUT when a page of its own context is sent to the sign-in page', async () => {
    const url = 'https://staging.example.com/reports';
    const browserLauncher = createFakeCrawlBrowserLauncher({
      redirectsByUrl: { [url]: 'https://staging.example.com/login' },
    });

    await expect(
      analyzePages({
        urls: [url],
        allowlist: ALLOWLIST,
        baseUrl: BASE_URL,
        browserLauncher,
        testIdAttribute: 'data-testid',
        revealCollapsed: true,
        identity: { config: IDENTITY_WITH_LOGIN, env: {}, cdpEndpointUrl: 'http://localhost:9222' },
      }),
    ).rejects.toMatchObject({ code: 'EXPLORE_SIGNED_OUT' });
    expect(browserLauncher.closedContexts).toBe(1);
    expect(browserLauncher.closedBrowsers).toBe(1);
  });

  it('stops with EXPLORE_SIGNED_OUT when a click on a panel signs the context out', async () => {
    const url = 'https://staging.example.com/reports';
    const browserLauncher = createFakeCrawlBrowserLauncher({
      redirectsByUrl: { [url]: 'https://staging.example.com/login' },
      revealRoundsByUrl: { [url]: [1] },
    });

    await expect(
      analyzePages({
        urls: [url],
        allowlist: ALLOWLIST,
        baseUrl: BASE_URL,
        browserLauncher,
        testIdAttribute: 'data-testid',
        revealCollapsed: true,
        identity: { config: IDENTITY_WITH_LOGIN, env: {}, cdpEndpointUrl: 'http://localhost:9222' },
      }),
    ).rejects.toMatchObject({ code: 'EXPLORE_SIGNED_OUT' });
  });

  it('does not stop on the sign-in page itself, or when the identity names no sign-in page', async () => {
    const loginUrl = 'https://staging.example.com/login';
    const browserLauncher = createFakeCrawlBrowserLauncher({
      ariaSnapshotByUrl: { [loginUrl]: { role: 'document' } },
      elementsByUrl: { [loginUrl]: EMPTY_ELEMENTS },
    });

    const onLoginPage = await analyzePages({
      urls: [loginUrl],
      allowlist: ALLOWLIST,
      baseUrl: BASE_URL,
      browserLauncher,
      testIdAttribute: 'data-testid',
      revealCollapsed: true,
      identity: { config: IDENTITY_WITH_LOGIN, env: {}, cdpEndpointUrl: 'http://localhost:9222' },
    });
    const withoutLoginUrl = await analyzePages({
      urls: [loginUrl],
      allowlist: ALLOWLIST,
      baseUrl: BASE_URL,
      browserLauncher,
      testIdAttribute: 'data-testid',
      revealCollapsed: true,
      identity: {
        config: { auth: 'cdp-attach', secret: 'QA_ADMIN_PASSWORD' },
        env: {},
        cdpEndpointUrl: 'http://localhost:9222',
      },
    });

    expect(onLoginPage.pageModelSet.pages).toHaveLength(1);
    expect(withoutLoginUrl.pageModelSet.pages).toHaveLength(1);
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
