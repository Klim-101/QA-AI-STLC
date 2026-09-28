// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { EnvironmentConfig } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACTION_TIMEOUT_MS,
  DEFAULT_NAVIGATION_TIMEOUT_MS,
  resolveBrowserTimeouts,
} from './browser-timeouts.js';

const ENVIRONMENT: EnvironmentConfig = {
  baseUrl: 'https://staging.example.test/',
  allowlist: ['staging.example.test'],
};

describe('resolveBrowserTimeouts', () => {
  it("falls back to Playwright's own default when the environment sets neither timeout", () => {
    expect(resolveBrowserTimeouts(ENVIRONMENT)).toEqual({
      navigationTimeoutMs: DEFAULT_NAVIGATION_TIMEOUT_MS,
      actionTimeoutMs: DEFAULT_ACTION_TIMEOUT_MS,
    });
    expect(DEFAULT_NAVIGATION_TIMEOUT_MS).toBe(30_000);
    expect(DEFAULT_ACTION_TIMEOUT_MS).toBe(30_000);
  });

  it("honors the environment's own navigationTimeoutMs and actionTimeoutMs", () => {
    const timeouts = resolveBrowserTimeouts({
      ...ENVIRONMENT,
      navigationTimeoutMs: 60_000,
      actionTimeoutMs: 5_000,
    });

    expect(timeouts).toEqual({ navigationTimeoutMs: 60_000, actionTimeoutMs: 5_000 });
  });
});
