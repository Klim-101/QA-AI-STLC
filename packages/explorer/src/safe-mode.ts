// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { RouteHandler } from '@qa-ai-stlc/core';
import type { RequestLogEntry } from './request-log.js';

/**
 * Safe mode's enforcement point (development plan section 6.4): every non-GET request is
 * intercepted and aborted before it reaches the network, so a crawl can never mutate the
 * application under test. `onBlocked` is called once per aborted request, for callers that need
 * to count or log it.
 */
export function createSafeModeRouteHandler(onBlocked: (entry: RequestLogEntry) => void): RouteHandler {
  return (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      return route.continue();
    }
    onBlocked({ method: request.method(), url: request.url(), blocked: true });
    return route.abort();
  };
}
