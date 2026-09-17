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

describe('createSafeModeRouteHandler', () => {
  it('continues a GET request without calling onBlocked', async () => {
    const onBlocked = vi.fn();
    const { route, calls } = createFakeRoute('GET', 'https://example.com/');

    await createSafeModeRouteHandler(onBlocked)(route);

    expect(calls).toEqual(['continue']);
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it('aborts a non-GET request and reports it through onBlocked', async () => {
    const onBlocked = vi.fn();
    const { route, calls } = createFakeRoute('POST', 'https://example.com/tasks');

    await createSafeModeRouteHandler(onBlocked)(route);

    expect(calls).toEqual(['abort']);
    expect(onBlocked).toHaveBeenCalledWith({
      method: 'POST',
      url: 'https://example.com/tasks',
      blocked: true,
    });
  });
});
