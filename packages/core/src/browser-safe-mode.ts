// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { RouteHandler } from './ports/browser-launcher.js';

export interface BlockedRequest {
  readonly method: string;
  readonly url: string;
}

/**
 * Safe mode for an agent-driven session (AGENTS.md 12.4, ADR-005): every non-GET request is
 * aborted before it leaves the browser, so an exploratory click can never submit a form or
 * mutate the application under test. `onBlocked` is called once per aborted request so a session
 * can report what it stopped.
 */
export function createBrowserSafeModeRouteHandler(
  onBlocked: (request: BlockedRequest) => void,
): RouteHandler {
  return (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      return route.continue();
    }
    onBlocked({ method: request.method(), url: request.url() });
    return route.abort();
  };
}
