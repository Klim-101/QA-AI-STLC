// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { BrowserLauncher } from '@qa-ai-stlc/core';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { chromium } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyzePages } from '../src/analyze-pages.js';
import { buildSelectorRegistry } from '../src/build-selector-registry.js';

// A fixed port, distinct from the ports the other demo-app tests use.
const PORT = 9005;
const BASE_URL = `http://localhost:${String(PORT)}`;
const PAGE_URL = `${BASE_URL}/localized`;
const STARTUP_TIMEOUT_MS = 60_000;

let demoApp: ManagedServer;

beforeAll(async () => {
  demoApp = await startDemoApp(PORT);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(async () => {
  await demoApp.stop();
});

// A machine whose browser asks for `hostLanguage`: the language a context takes when the
// environment pins none. Chromium's `--lang` is what a host locale becomes.
function launcherOnHostLanguage(hostLanguage: string): BrowserLauncher {
  return {
    launch: async () => {
      const browser = await chromium.launch({ args: [`--lang=${hostLanguage}`] });
      return {
        newContext: (options) =>
          browser.newContext(options?.locale === undefined ? {} : { locale: options.locale }),
        contexts: () => browser.contexts(),
        close: () => browser.close(),
      };
    },
    connectOverCdp: () => Promise.reject(new Error('Not used by this test.')),
  };
}

async function elementNames(hostLanguage: string, locale: string | undefined): Promise<string[]> {
  const browserLauncher = launcherOnHostLanguage(hostLanguage);
  const common = {
    allowlist: ['localhost'],
    baseUrl: `${BASE_URL}/`,
    browserLauncher,
    ...(locale === undefined ? {} : { locale }),
  };
  const { pageModelSet } = await analyzePages({
    urls: [PAGE_URL],
    testIdAttribute: 'data-testid',
    ...common,
  });
  const { registry } = await buildSelectorRegistry({
    environmentName: 'staging',
    pageModelSet,
    ...common,
  });
  return registry.elements.map((element) => element.name ?? '').sort();
}

describe('an environment locale (demo app)', () => {
  it('gives the same registry on machines with different host languages when the locale is pinned', async () => {
    const onSpanishHost = await elementNames('es-ES', 'en-US');
    const onFrenchHost = await elementNames('fr-FR', 'en-US');

    expect(onSpanishHost).toEqual(onFrenchHost);
    expect(onSpanishHost).toEqual(['categories', 'signIn']);
  }, 120_000);

  it('names the elements in the pinned language, whatever the host asks for', async () => {
    expect(await elementNames('en-US', 'es-ES')).toEqual(['categorias', 'iniciarSesion']);
  }, 120_000);
});
