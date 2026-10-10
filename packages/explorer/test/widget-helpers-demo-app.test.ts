// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { playwrightBrowserLauncher } from '@qa-ai-stlc/core';
import { chromium } from 'playwright-core';
import ts from 'typescript';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyzePages } from '../src/analyze-pages.js';
import { buildSelectorRegistry } from '../src/build-selector-registry.js';
import type { ComponentLibraryProfile } from '../src/component-library-profile.js';
import { generateLocatorModule } from '../src/generate-locator-module.js';
import { KENDO_ANGULAR_PROFILE } from '../src/profiles/kendo-angular.js';
import { KENDO_JQUERY_PROFILE } from '../src/profiles/kendo-jquery.js';

const PORT = 4404;
const BASE_URL = `http://localhost:${String(PORT)}`;
const STARTUP_TIMEOUT_MS = 60_000;

let demoApp: ManagedServer;

beforeAll(async () => {
  demoApp = await startDemoApp(PORT);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(async () => {
  await demoApp.stop();
});

type WidgetHelper = (page: unknown, ...args: string[]) => Promise<void>;

interface FixtureModule {
  readonly source: string;
  readonly helpers: Readonly<Record<string, WidgetHelper>>;
  readonly names: Readonly<Record<string, string>>;
}

// Explores the fixture the way `qa explore` does, renders the locator module and loads it, so the
// helpers a generated spec would call are the ones exercised.
async function loadLocatorModule(
  directory: string,
  pagePath: string,
  profile: ComponentLibraryProfile,
  library: 'kendo-jquery' | 'kendo-angular',
): Promise<FixtureModule> {
  const common = {
    allowlist: ['localhost'],
    baseUrl: BASE_URL,
    browserLauncher: playwrightBrowserLauncher,
  };
  const { pageModelSet } = await analyzePages({
    ...common,
    urls: [`${BASE_URL}${pagePath}`],
    testIdAttribute: 'data-testid',
    profile,
  });
  const { registry } = await buildSelectorRegistry({ ...common, pageModelSet, profile });
  const { source } = generateLocatorModule(registry, { generatorVersion: '0.0.0-test' });

  const names: Record<string, string> = {};
  for (const element of registry.elements) {
    if (element.library === library && element.name !== undefined) {
      names[element.kind] = element.name;
    }
  }
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
  }).outputText;
  const filePath = join(directory, `${library}-locators.mjs`);
  await writeFile(filePath, compiled, 'utf8');
  const helpers = (await import(pathToFileURL(filePath).href)) as Record<string, WidgetHelper>;
  return { source, helpers, names };
}

interface FixtureDocument {
  getElementById(id: string): { textContent: string | null } | null;
}

function readSummary(): string | null | undefined {
  const { document } = globalThis as unknown as { document: FixtureDocument };
  return document.getElementById('selection-summary')?.textContent;
}

describe('generated widget helpers (demo app)', () => {
  it('drive the Kendo UI for jQuery widgets through the generated module', async () => {
    const directory = await mkdtemp(join(fileURLToPath(new URL('.', import.meta.url)), '.tmp-helpers-'));
    const browser = await chromium.launch();
    try {
      const module = await loadLocatorModule(
        directory,
        '/kendo-jquery.html',
        KENDO_JQUERY_PROFILE,
        'kendo-jquery',
      );
      const page = await browser.newPage();
      await page.goto(`${BASE_URL}/kendo-jquery.html`);
      const helper = (kind: string, suffix: string): WidgetHelper => {
        const found = module.helpers[`${module.names[kind] ?? ''}${suffix}`];
        if (found === undefined) {
          throw new Error(`No ${suffix} helper for ${kind}`);
        }
        return found;
      };

      await helper('dropdownlist', 'SelectOption')(page, 'High');
      await helper('combobox', 'SelectOption')(page, 'Casey');
      await helper('multiselect', 'SelectOption')(page, 'billing');
      await helper('multiselect', 'SelectOption')(page, 'urgent');
      await helper('multiselect', 'SelectOption')(page, 'billing');
      await helper('datepicker', 'SetDate')(page, '2031-04-15');
      await helper('combobox', 'OpenPopup')(page);
      await helper('combobox', 'ClosePopup')(page);

      expect(await page.evaluate(readSummary)).toBe('Priority high, assignee Casey, 2 tag(s).');
      await expect(helper('dropdownlist', 'SelectOption')(page, 'Critical')).rejects.toThrow();
    } finally {
      await browser.close();
      await rm(directory, { recursive: true, force: true });
    }
  }, 120_000);

  it('drive the Kendo UI for Angular widgets through the generated module', async () => {
    const directory = await mkdtemp(join(fileURLToPath(new URL('.', import.meta.url)), '.tmp-helpers-'));
    const browser = await chromium.launch();
    try {
      const module = await loadLocatorModule(
        directory,
        '/kendo-angular.html',
        KENDO_ANGULAR_PROFILE,
        'kendo-angular',
      );
      const page = await browser.newPage();
      await page.goto(`${BASE_URL}/kendo-angular.html`);
      const helper = (kind: string, suffix: string): WidgetHelper => {
        const found = module.helpers[`${module.names[kind] ?? ''}${suffix}`];
        if (found === undefined) {
          throw new Error(`No ${suffix} helper for ${kind}`);
        }
        return found;
      };

      await helper('combobox', 'SelectOption')(page, 'Casey');
      await helper('multiselect', 'SelectOption')(page, 'billing');
      await helper('multiselect', 'SelectOption')(page, 'urgent');
      await helper('datepicker', 'SetDate')(page, '15.04.2031');
      await helper('datepicker', 'OpenPopup')(page);
      await helper('datepicker', 'ClosePopup')(page);

      expect(await page.evaluate(readSummary)).toBe('Status none, owner Casey, 2 label(s).');
      // BUG-017: the model changes but the drop-down never shows the choice, which the helper reports.
      await expect(helper('dropdownlist', 'SelectOption')(page, 'Done')).rejects.toThrow(/does not show/);
    } finally {
      await browser.close();
      await rm(directory, { recursive: true, force: true });
    }
  }, 120_000);
});
