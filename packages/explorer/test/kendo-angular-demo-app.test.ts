// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { playwrightBrowserLauncher } from '@qa-ai-stlc/core';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyzePages } from '../src/analyze-pages.js';
import { buildSelectorRegistry } from '../src/build-selector-registry.js';
import { KENDO_ANGULAR_PROFILE } from '../src/profiles/kendo-angular.js';

const PORT = 4400;
const BASE_URL = `http://localhost:${String(PORT)}`;
const PAGE_URL = `${BASE_URL}/kendo-angular.html`;
const STARTUP_TIMEOUT_MS = 60_000;

let demoApp: ManagedServer;

beforeAll(async () => {
  demoApp = await startDemoApp(PORT);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(async () => {
  await demoApp.stop();
});

async function exploreKendoPage(): Promise<Awaited<ReturnType<typeof buildSelectorRegistry>>['registry']> {
  const common = {
    allowlist: ['localhost'],
    baseUrl: BASE_URL,
    browserLauncher: playwrightBrowserLauncher,
  };
  const { pageModelSet } = await analyzePages({
    ...common,
    urls: [PAGE_URL],
    testIdAttribute: 'data-testid',
    profile: KENDO_ANGULAR_PROFILE,
  });
  const { registry } = await buildSelectorRegistry({
    ...common,
    pageModelSet,
    profile: KENDO_ANGULAR_PROFILE,
  });
  return registry;
}

describe('Kendo UI for Angular profile (demo app)', () => {
  it('registers every widget once, on a locator that is not a generated id or a hidden native control', async () => {
    const { elements } = await exploreKendoPage();

    const widgets = elements.filter((element) => element.library === 'kendo-angular');
    expect(widgets.map((widget) => widget.kind).sort()).toEqual(
      [
        'combobox',
        'datepicker',
        'dropdownlist',
        'grid',
        'grid',
        'multiselect',
        'numerictextbox',
        'tabstrip',
      ].sort(),
    );
    // The inputs and buttons a host element renders inside itself are not registered as elements of
    // their own. The edit window is created by a click, so a page read does not see it.
    const generatedIdPattern = /k-[0-9a-f]{8}/;
    for (const element of elements) {
      const values = element.locatorCandidates.map((candidate) => candidate.value);
      expect(values.filter((value) => generatedIdPattern.test(value))).toEqual([]);
    }
    const otherNames = elements
      .filter((element) => element.library === undefined)
      .map((element) => element.name);
    expect(otherNames.sort()).toEqual(['editDetails', 'goToTheNextPage', 'goToThePreviousPage']);
  }, 120_000);

  it('names each widget and never locates it through its generated popup id', async () => {
    const { elements } = await exploreKendoPage();

    const byKind = new Map(elements.map((element) => [element.kind, element]));
    expect(byKind.get('combobox')?.name).toBe('owner');
    expect(byKind.get('dropdownlist')?.name).toBe('status');
    expect(byKind.get('combobox')?.popupId).toMatch(/^k-[0-9a-f]{8}-list$/);
    expect(byKind.get('tabstrip')?.popupId).toBeUndefined();
    for (const widget of elements.filter((element) => element.library === 'kendo-angular')) {
      expect(widget.locatorCandidates.map((candidate) => candidate.value).join(' ')).not.toContain(
        'aria-controls',
      );
    }
  }, 120_000);

  it('gives every widget a locator that is not position-based', async () => {
    const { elements } = await exploreKendoPage();

    for (const widget of elements.filter((element) => element.library === 'kendo-angular')) {
      expect(widget.stabilityScore, widget.name).toBe(1);
    }
  }, 120_000);
});
