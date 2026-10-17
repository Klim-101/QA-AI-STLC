// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError, type AuthPage } from '@qa-ai-stlc/core';
import type { ExplorerIdentity } from './identity.js';

/**
 * Throws `EXPLORE_SIGNED_OUT` when `page` was sent to the identity's sign-in page while loading
 * `requestedUrl`. A context of its own that lost its session would otherwise be read as the login
 * form and registered as if it were the page asked for.
 */
export function assertNotSignedOut(
  page: AuthPage,
  requestedUrl: string,
  identity: ExplorerIdentity | undefined,
): void {
  const loginUrl = identity?.config.loginUrl;
  if (loginUrl === undefined) {
    return;
  }
  const loginPath = new URL(loginUrl, requestedUrl).pathname;
  const requestedPath = new URL(requestedUrl).pathname;
  const landedPath = new URL(page.url()).pathname;
  if (landedPath !== loginPath || requestedPath === loginPath) {
    return;
  }
  throw new QaError(
    'EXPLORE_SIGNED_OUT',
    `Loading ${requestedPath} in a context of its own ended on the sign-in page (${loginPath}); nothing was saved.`,
    {
      remediation:
        'The session was not accepted by a fresh browser context. Check that the application keeps its session in cookies or local storage (not session storage) and that a session token is not single-use; then run the exploration again, or without --expand-collapsed.',
    },
  );
}
