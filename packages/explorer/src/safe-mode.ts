// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  createBrowserSafeModeRouteHandler,
  type RouteHandler,
  type SafeModeRequestTally,
} from '@qa-ai-stlc/core';
import type { SafeNonGetRequest } from '@qa-ai-stlc/schemas';
import type { RequestLogEntry } from './request-log.js';

/** The non-GET requests an environment lets through, and where safe mode reports what it did (ADR-0014). */
export interface SafeModeRequests {
  readonly safeRequests?: readonly SafeNonGetRequest[];
  readonly tally?: SafeModeRequestTally;
  /** Called once for each request let through only because the environment lists it. */
  readonly onAllowed?: (entry: RequestLogEntry) => void;
}

/**
 * Safe mode's enforcement point for an exploration (development plan section 6.4): every non-GET
 * request is intercepted and aborted before it reaches the network, so a crawl can never mutate the
 * application under test, except a POST the environment names exactly (ADR-0014). Every request is
 * also checked against `allowlist` here, since this handler sees every request the page makes
 * regardless of what triggered it (#306, the same gap #279 closed for a live browser session).
 * `baseUrl` is the environment's configured URL: an allowed request must also share its scheme and
 * effective port, not just its hostname. `onBlocked` is called once per aborted request, for
 * callers that need to count or log it.
 *
 * It is the same handler a browser session uses, so exploration and `qa.browser_*` sessions cannot
 * disagree about what safe mode lets through (AGENTS.md 12.7).
 */
export function createSafeModeRouteHandler(
  allowlist: readonly string[],
  baseUrl: string,
  onBlocked: (entry: RequestLogEntry) => void,
  requests: SafeModeRequests = {},
): RouteHandler {
  return createBrowserSafeModeRouteHandler(
    allowlist,
    baseUrl,
    ({ method, url }) => {
      requests.tally?.recordBlocked(method, url);
      onBlocked({ method, url, blocked: true });
    },
    {
      ...(requests.safeRequests === undefined ? {} : { safeRequests: requests.safeRequests }),
      onAllowed: ({ method, url }) => {
        requests.tally?.recordAllowed(method, url);
        requests.onAllowed?.({ method, url, blocked: false, allowedByConfig: true });
      },
    },
  );
}
