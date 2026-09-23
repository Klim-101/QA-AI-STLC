// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { PageRoute } from '@qa-ai-stlc/core';
import { describe, expect, it, vi } from 'vitest';
import { createSafeModeRouteHandler } from './safe-mode.js';

function createFakeRoute(method: string, url: string) {
  const calls: string[] = [];
  const route: PageRoute = {
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
  return { route, calls };
}

const ALLOWLIST = ['example.com'];
const BASE_URL = 'https://example.com/';

describe('createSafeModeRouteHandler', () => {
  it('continues an allowlisted GET request without calling onBlocked', async () => {
    const onBlocked = vi.fn();
    const { route, calls } = createFakeRoute('GET', 'https://example.com/');

    await createSafeModeRouteHandler(ALLOWLIST, BASE_URL, onBlocked)(route);

    expect(calls).toEqual(['continue']);
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it('aborts a non-GET request and reports it through onBlocked', async () => {
    const onBlocked = vi.fn();
    const { route, calls } = createFakeRoute('POST', 'https://example.com/tasks');

    await createSafeModeRouteHandler(ALLOWLIST, BASE_URL, onBlocked)(route);

    expect(calls).toEqual(['abort']);
    expect(onBlocked).toHaveBeenCalledWith({
      method: 'POST',
      url: 'https://example.com/tasks',
      blocked: true,
    });
  });

  it('aborts a GET request off the domain allowlist and reports it (regression, #306)', async () => {
    const onBlocked = vi.fn();
    const { route, calls } = createFakeRoute('GET', 'https://evil.test/phishing');

    await createSafeModeRouteHandler(ALLOWLIST, BASE_URL, onBlocked)(route);

    expect(calls).toEqual(['abort']);
    expect(onBlocked).toHaveBeenCalledWith({
      method: 'GET',
      url: 'https://evil.test/phishing',
      blocked: true,
    });
  });

  it('aborts a GET request off the domain scheme/port and reports it (regression, #306)', async () => {
    const onBlocked = vi.fn();
    const { route, calls } = createFakeRoute('GET', 'http://example.com:9999/');

    await createSafeModeRouteHandler(ALLOWLIST, BASE_URL, onBlocked)(route);

    expect(calls).toEqual(['abort']);
    expect(onBlocked).toHaveBeenCalledWith({
      method: 'GET',
      url: 'http://example.com:9999/',
      blocked: true,
    });
  });
});
