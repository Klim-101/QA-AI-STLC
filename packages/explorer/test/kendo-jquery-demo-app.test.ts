// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { playwrightBrowserLauncher } from '@qa-ai-stlc/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyzePages } from '../src/analyze-pages.js';
import { buildSelectorRegistry } from '../src/build-selector-registry.js';
import { KENDO_JQUERY_PROFILE } from '../src/profiles/kendo-jquery.js';

const PORT = 4395;
const BASE_URL = `http://localhost:${String(PORT)}`;
const PAGE_URL = `${BASE_URL}/kendo-jquery.html`;
const STARTUP_TIMEOUT_MS = 60_000;

let demoApp: ChildProcess;

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Demo app did not become reachable at ${url} within ${String(timeoutMs)}ms`);
}

beforeAll(async () => {
  const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath === undefined) {
    throw new Error('This test must run through an npm script (npm_execpath is unset).');
  }
  demoApp = spawn(process.execPath, [npmExecPath, 'run', 'start', '--workspace', '@qa-ai-stlc/demo-app'], {
    cwd: repoRoot,
    env: { ...process.env, DEMO_APP_PORT: String(PORT) },
    stdio: 'ignore',
  });
  await waitForServer(PAGE_URL, STARTUP_TIMEOUT_MS);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(() => {
  demoApp.kill();
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
