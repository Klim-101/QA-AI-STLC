// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { createBrowserSafeModeRouteHandler, type BlockedRequest } from './browser-safe-mode.js';
import type { PageRoute } from './ports/browser-launcher.js';

function createRoute(method: string, url: string): PageRoute & { readonly calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    request: () => ({ method: () => method, url: () => url }),
    abort: () => {
      calls.push('abort');
      return Promise.resolve();
    },
    continue: () => {
      calls.push('continue');
      return Promise.resolve();
    },
  };
}

const ALLOWLIST = ['staging.example.test'];
const BASE_URL = 'https://staging.example.test/';

describe('createBrowserSafeModeRouteHandler', () => {
  it('lets an allowlisted GET request through without reporting it', async () => {
    const blocked: BlockedRequest[] = [];
    const route = createRoute('GET', 'https://staging.example.test/');

    await createBrowserSafeModeRouteHandler(ALLOWLIST, BASE_URL, (request) => blocked.push(request))(route);

    expect(route.calls).toEqual(['continue']);
    expect(blocked).toEqual([]);
  });

  it('aborts every other method and reports it once', async () => {
    const blocked: BlockedRequest[] = [];
    const route = createRoute('POST', 'https://staging.example.test/orders');

    await createBrowserSafeModeRouteHandler(ALLOWLIST, BASE_URL, (request) => blocked.push(request))(route);

    expect(route.calls).toEqual(['abort']);
    expect(blocked).toEqual([{ method: 'POST', url: 'https://staging.example.test/orders' }]);
  });

  it('aborts a GET request off the domain allowlist and reports it (regression, #279)', async () => {
    const blocked: BlockedRequest[] = [];
    const route = createRoute('GET', 'https://evil.test/phishing');

    await createBrowserSafeModeRouteHandler(ALLOWLIST, BASE_URL, (request) => blocked.push(request))(route);

    expect(route.calls).toEqual(['abort']);
    expect(blocked).toEqual([{ method: 'GET', url: 'https://evil.test/phishing' }]);
  });

  it('aborts a GET request off the domain scheme/port and reports it (regression, #306)', async () => {
    const blocked: BlockedRequest[] = [];
    const route = createRoute('GET', 'http://staging.example.test:9999/');

    await createBrowserSafeModeRouteHandler(ALLOWLIST, BASE_URL, (request) => blocked.push(request))(route);

    expect(route.calls).toEqual(['abort']);
    expect(blocked).toEqual([{ method: 'GET', url: 'http://staging.example.test:9999/' }]);
  });
});
