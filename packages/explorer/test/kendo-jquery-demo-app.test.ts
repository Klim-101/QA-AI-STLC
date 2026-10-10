// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { playwrightBrowserLauncher } from '@qa-ai-stlc/core';
import { startDemoApp } from '@qa-ai-stlc/test-utils/demo-app-server';
import type { ManagedServer } from '@qa-ai-stlc/test-utils/managed-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyzePages } from '../src/analyze-pages.js';
import { buildSelectorRegistry } from '../src/build-selector-registry.js';
import { KENDO_JQUERY_PROFILE } from '../src/profiles/kendo-jquery.js';

const PORT = 4395;
const BASE_URL = `http://localhost:${String(PORT)}`;
const PAGE_URL = `${BASE_URL}/kendo-jquery.html`;
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
    profile: KENDO_JQUERY_PROFILE,
  });
  const { registry } = await buildSelectorRegistry({
    ...common,
    pageModelSet,
    profile: KENDO_JQUERY_PROFILE,
  });
  return registry;
}

describe('Kendo UI for jQuery profile (demo app)', () => {
  it('registers every widget once, on a locator that is not a generated id or a hidden native control', async () => {
    const { elements } = await exploreKendoPage();

    const widgets = elements.filter((element) => element.library === 'kendo-jquery');
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
        'window',
      ].sort(),
    );
    // The hidden native controls (a `display: none` select or input per widget) and the buttons
    // and inner inputs Kendo renders inside a wrapper are not registered as elements of their own.
    const hiddenNativeIds = ['#priority', '#assignee', '#tags', '#due-date', '#estimate'];
    for (const element of elements) {
      const values = element.locatorCandidates.map((candidate) => candidate.value);
      expect(values.filter((value) => hiddenNativeIds.includes(value))).toEqual([]);
      expect(values.filter((value) => /[0-9a-f]{8}-[0-9a-f]{4}-/.test(value))).toEqual([]);
    }
    const otherNames = elements
      .filter((element) => element.library === undefined)
      .map((element) => element.name);
    expect(otherNames.sort()).toEqual([
      'apply',
      'cancel',
      'editDetails',
      'goToTheNextPage',
      'goToThePreviousPage',
      'note',
    ]);
  }, 120_000);

  it('names each widget and links it to its popup', async () => {
    const { elements } = await exploreKendoPage();

    const byKind = new Map(elements.map((element) => [element.kind, element]));
    expect(byKind.get('combobox')).toEqual(
      expect.objectContaining({ name: 'assignee', popupId: 'assignee_listbox' }),
    );
    expect(byKind.get('datepicker')?.popupId).toBe('due-date_dateview');
    expect(byKind.get('tabstrip')?.popupId).toBeUndefined();
    expect(byKind.get('dropdownlist')?.locatorCandidates[0]?.value).toBe(
      '[aria-controls="priority_listbox"], [aria-owns="priority_listbox"]',
    );
  }, 120_000);

  it('keeps a stable locator for the widget whose label the page lost (BUG-015)', async () => {
    const { elements } = await exploreKendoPage();

    const dropdown = elements.find((element) => element.kind === 'dropdownlist');
    expect(dropdown?.stabilityScore).toBe(1);
  }, 120_000);
});
