// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { EnvironmentConfig } from '@qa-ai-stlc/schemas';

/** Playwright's own default (P6-23): applies to every navigation with no configured override. */
export const DEFAULT_NAVIGATION_TIMEOUT_MS = 30_000;
/** Playwright's own default (P6-23): applies to every click/fill with no configured override. */
export const DEFAULT_ACTION_TIMEOUT_MS = 30_000;

export interface BrowserTimeouts {
  readonly navigationTimeoutMs: number;
  readonly actionTimeoutMs: number;
}

/**
 * The navigation and action timeouts an environment's own `navigationTimeoutMs`/`actionTimeoutMs`
 * configure (ADR-011: a value that differs per environment, such as a consistently slower staging
 * server, is a field on that environment rather than a generic overrides block), falling back to
 * Playwright's own default.
 */
export function resolveBrowserTimeouts(environment: EnvironmentConfig): BrowserTimeouts {
  return {
    navigationTimeoutMs: environment.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS,
    actionTimeoutMs: environment.actionTimeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS,
  };
}
