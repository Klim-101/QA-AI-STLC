// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { isUrlAllowed, type RouteHandler } from '@qa-ai-stlc/core';
import type { RequestLogEntry } from './request-log.js';

/**
 * Safe mode's enforcement point (development plan section 6.4): every non-GET request is
 * intercepted and aborted before it reaches the network, so a crawl can never mutate the
 * application under test. Every GET is also checked against `allowlist` here, since this handler
 * sees every request the page makes regardless of what triggered it — a real navigation or
 * redirect can take the page off the allowlist even though `crawl()`'s own link-following already
 * filters which links it queues (#306, the same gap #279 closed for a live browser session).
 * `onBlocked` is called once per aborted request, for callers that need to count or log it.
 */
export function createSafeModeRouteHandler(
  allowlist: readonly string[],
  onBlocked: (entry: RequestLogEntry) => void,
): RouteHandler {
  return (route) => {
    const request = route.request();
    const method = request.method();
    const url = request.url();
    if (method === 'GET' && isUrlAllowed(url, allowlist)) {
      return route.continue();
    }
    onBlocked({ method, url, blocked: true });
    return route.abort();
  };
}
