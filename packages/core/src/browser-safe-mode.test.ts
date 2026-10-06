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

  it('allows an allowlisted non-GET request when allowMutations is set (P3-14, ADR-0009)', async () => {
    const blocked: BlockedRequest[] = [];
    const route = createRoute('POST', 'https://staging.example.test/login');

    await createBrowserSafeModeRouteHandler(ALLOWLIST, BASE_URL, (request) => blocked.push(request), {
      allowMutations: true,
    })(route);

    expect(route.calls).toEqual(['continue']);
    expect(blocked).toEqual([]);
  });

  it('still aborts a non-allowlisted non-GET request even when allowMutations is set', async () => {
    const blocked: BlockedRequest[] = [];
    const route = createRoute('POST', 'https://evil.test/phishing');

    await createBrowserSafeModeRouteHandler(ALLOWLIST, BASE_URL, (request) => blocked.push(request), {
      allowMutations: true,
    })(route);

    expect(route.calls).toEqual(['abort']);
    expect(blocked).toEqual([{ method: 'POST', url: 'https://evil.test/phishing' }]);
  });

  describe('safeRequests (ADR-0014)', () => {
    const SAFE = [
      { method: 'POST', path: '/auth/refresh-token', reason: 'Exchanges the refresh cookie.' },
    ] as const;

    async function send(method: string, url: string, onAllowed?: (request: BlockedRequest) => void) {
      const blocked: BlockedRequest[] = [];
      const route = createRoute(method, url);
      await createBrowserSafeModeRouteHandler(ALLOWLIST, BASE_URL, (request) => blocked.push(request), {
        safeRequests: SAFE,
        ...(onAllowed === undefined ? {} : { onAllowed }),
      })(route);
      return { route, blocked };
    }

    it('lets the named POST through and reports it as allowed, not blocked', async () => {
      const allowed: BlockedRequest[] = [];

      const { route, blocked } = await send(
        'POST',
        'https://staging.example.test/auth/refresh-token',
        (request) => allowed.push(request),
      );

      expect(route.calls).toEqual(['continue']);
      expect(blocked).toEqual([]);
      expect(allowed).toEqual([{ method: 'POST', url: 'https://staging.example.test/auth/refresh-token' }]);
    });

    it('lets it through without an onAllowed callback', async () => {
      const { route } = await send('POST', 'https://staging.example.test/auth/refresh-token');

      expect(route.calls).toEqual(['continue']);
    });

    it('ignores the query of the URL when it matches the path, and nothing else of it', async () => {
      const { route } = await send('POST', 'https://staging.example.test/auth/refresh-token?x=1');

      expect(route.calls).toEqual(['continue']);
    });

    it.each([
      ['another path', 'POST', 'https://staging.example.test/auth/logout'],
      ['a longer path', 'POST', 'https://staging.example.test/auth/refresh-token/extra'],
      ['a path in another case', 'POST', 'https://staging.example.test/Auth/Refresh-Token'],
      ['another method', 'PUT', 'https://staging.example.test/auth/refresh-token'],
      ['another method', 'DELETE', 'https://staging.example.test/auth/refresh-token'],
    ])('still aborts %s (%s)', async (_label, method, url) => {
      const { route, blocked } = await send(method, url);

      expect(route.calls).toEqual(['abort']);
      expect(blocked).toEqual([{ method, url }]);
    });

    it('never lets a named request reach a host off the allowlist, scheme or port', async () => {
      for (const url of [
        'https://evil.test/auth/refresh-token',
        'http://staging.example.test/auth/refresh-token',
        'https://staging.example.test:8443/auth/refresh-token',
      ]) {
        const { route, blocked } = await send('POST', url);

        expect(route.calls).toEqual(['abort']);
        expect(blocked).toEqual([{ method: 'POST', url }]);
      }
    });

    it('treats an empty list like no list', async () => {
      const blocked: BlockedRequest[] = [];
      const route = createRoute('POST', 'https://staging.example.test/auth/refresh-token');

      await createBrowserSafeModeRouteHandler(ALLOWLIST, BASE_URL, (request) => blocked.push(request), {
        safeRequests: [],
      })(route);

      expect(route.calls).toEqual(['abort']);
    });

    it('does not report an ordinary GET as allowed by the list', async () => {
      const allowed: BlockedRequest[] = [];

      await send('GET', 'https://staging.example.test/home', (request) => allowed.push(request));

      expect(allowed).toEqual([]);
    });
  });
});
