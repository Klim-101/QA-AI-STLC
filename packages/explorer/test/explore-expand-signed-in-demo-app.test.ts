// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { playwrightBrowserLauncher, type BrowserLauncher } from '@qa-ai-stlc/core';
import type { IdentityConfig } from '@qa-ai-stlc/schemas';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyzePages } from '../src/analyze-pages.js';

// A fixed port, distinct from the ports the other demo-app tests use.
const PORT = 4431;
const BASE_URL = `http://localhost:${String(PORT)}`;
const STARTUP_TIMEOUT_MS = 60_000;

let demoApp: ManagedServer;

beforeAll(async () => {
  demoApp = await startDemoApp(PORT);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(async () => {
  await demoApp.stop();
});

const identityConfig: IdentityConfig = {
  auth: 'storage-state',
  secret: 'QA_DEMO_ADMIN_PASSWORD',
  loginUrl: `${BASE_URL}/login`,
  username: 'admin@example.com',
};
const identity = { config: identityConfig, env: { QA_DEMO_ADMIN_PASSWORD: 'admin123' } };

function analyze(urls: readonly string[]): ReturnType<typeof analyzePages> {
  return analyzePages({
    urls,
    allowlist: ['localhost'],
    baseUrl: `${BASE_URL}/`,
    browserLauncher: playwrightBrowserLauncher,
    testIdAttribute: 'data-testid',
    revealCollapsed: true,
    identity,
  });
}

describe('open collapsed panels behind sign-in (demo app)', () => {
  it('registers the controls of a collapsed panel on every protected page, with a session token that is used once', async () => {
    const { pageModelSet, expandedPanelCount } = await analyze([
      `${BASE_URL}/rotating/first`,
      `${BASE_URL}/rotating/second`,
      `${BASE_URL}/rotating/third`,
    ]);

    expect(pageModelSet.pages).toHaveLength(3);
    for (const page of pageModelSet.pages) {
      const testIds = page.interactiveElements.map((element) => element.testId);
      expect(testIds).toEqual(expect.arrayContaining(['filter-customer', 'filter-reference']));
    }
    expect(expandedPanelCount).toBe(6);
  }, 90_000);

  it('stops with a coded error naming the page when a context starts without the current token', async () => {
    // A launcher that drops the rotated token from the state it is given stands for a context that
    // lost it: the application sends that context to the sign-in page.
    const forgetful: BrowserLauncher = {
      ...playwrightBrowserLauncher,
      launch: async (options) => {
        const browser = await playwrightBrowserLauncher.launch(options);
        return {
          ...browser,
          newContext: (contextOptions) =>
            browser.newContext({
              ...contextOptions,
              ...(contextOptions?.storageState === undefined
                ? {}
                : {
                    storageState: {
                      ...contextOptions.storageState,
                      cookies: contextOptions.storageState.cookies.filter(
                        (cookie) => cookie.name !== 'qa_rotating',
                      ),
                    },
                  }),
            }),
        };
      },
    };

    const outcome = analyzePages({
      urls: [`${BASE_URL}/rotating/first`, `${BASE_URL}/rotating/second`],
      allowlist: ['localhost'],
      baseUrl: `${BASE_URL}/`,
      browserLauncher: forgetful,
      testIdAttribute: 'data-testid',
      revealCollapsed: true,
      identity,
    });

    await expect(outcome).rejects.toMatchObject({
      code: 'EXPLORE_SIGNED_OUT',
      message: expect.stringContaining('/rotating/second') as unknown,
    });
  }, 90_000);
});
