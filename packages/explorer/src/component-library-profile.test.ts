// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { AuthPage } from '@qa-ai-stlc/core';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_READY_TIMEOUT_MS,
  listWidgetTargets,
  mergeGeneratedIdPatterns,
  resolveComponentLibraryProfile,
  waitUntilLibraryReady,
} from './component-library-profile.js';
import { KENDO_ANGULAR_PROFILE } from './profiles/kendo-angular.js';
import { KENDO_JQUERY_PROFILE } from './profiles/kendo-jquery.js';
import { createLocatorMethods } from './test-support/locator-stub.js';
import { SYNTHETIC_PROFILE } from './test-support/synthetic-profile.js';

function recordingPage(calls: unknown[]): AuthPage {
  return {
    goto: () => Promise.resolve(null),
    fill: () => Promise.resolve(),
    click: () => Promise.resolve(),
    press: () => Promise.resolve(),
    hover: () => Promise.resolve(),
    selectOption: () => Promise.resolve([]),
    setChecked: () => Promise.resolve(),
    setInputFiles: () => Promise.resolve(),
    on: () => undefined,
    close: () => Promise.resolve(),
    bringToFront: () => Promise.resolve(),
    keyboard: { press: () => Promise.resolve() },
    waitForLoadState: () => Promise.resolve(),
    route: () => Promise.resolve(),
    evaluate: (_pageFunction, arg) => {
      calls.push(arg);
      return Promise.resolve(undefined);
    },
    ariaSnapshotJSON: () => Promise.resolve(undefined),
    addScriptTag: () => Promise.resolve(undefined),
    ...createLocatorMethods(),
  };
}

describe('resolveComponentLibraryProfile', () => {
  it('returns no profile when none is selected or shipped', () => {
    expect(resolveComponentLibraryProfile('none')).toBeUndefined();
  });

  it('ships the Kendo UI for jQuery profile', () => {
    expect(resolveComponentLibraryProfile('kendo-jquery')).toBe(KENDO_JQUERY_PROFILE);
  });

  it('ships the Kendo UI for Angular profile', () => {
    expect(resolveComponentLibraryProfile('kendo-angular')).toBe(KENDO_ANGULAR_PROFILE);
  });

  it('returns the profile registered for the selected library', () => {
    expect(resolveComponentLibraryProfile('kendo-angular', { 'kendo-angular': SYNTHETIC_PROFILE })).toBe(
      SYNTHETIC_PROFILE,
    );
  });
});

describe('mergeGeneratedIdPatterns', () => {
  it('keeps the configured patterns when there is no profile', () => {
    expect(mergeGeneratedIdPatterns(['^r-'], undefined)).toEqual(['^r-']);
  });

  it('adds the profile patterns after the configured ones, without repeats', () => {
    expect(mergeGeneratedIdPatterns(['^r-', '^syn-\\d+$'], SYNTHETIC_PROFILE)).toEqual(['^r-', '^syn-\\d+$']);
  });
});

describe('waitUntilLibraryReady', () => {
  it('does nothing without a profile or without busy indicators', async () => {
    const calls: unknown[] = [];
    await waitUntilLibraryReady(recordingPage(calls), undefined);
    await waitUntilLibraryReady(recordingPage(calls), { ...SYNTHETIC_PROFILE, busySelectors: [] });
    expect(calls).toEqual([]);
  });

  it('waits in the page for the busy indicators, with the default or a given timeout', async () => {
    const calls: unknown[] = [];
    const page = recordingPage(calls);
    await waitUntilLibraryReady(page, SYNTHETIC_PROFILE);
    await waitUntilLibraryReady(page, SYNTHETIC_PROFILE, 250);
    expect(calls).toEqual([
      { busySelectors: ['.syn-loading'], timeoutMs: DEFAULT_READY_TIMEOUT_MS },
      { busySelectors: ['.syn-loading'], timeoutMs: 250 },
    ]);
  });
});

describe('listWidgetTargets', () => {
  it('lists the widgets that have actions, with the popup toggle when the profile names one', () => {
    expect(listWidgetTargets(KENDO_ANGULAR_PROFILE)).toEqual([
      { wrapperSelector: 'kendo-dropdownlist' },
      { wrapperSelector: 'kendo-combobox', popupToggleSelector: '.k-input-button' },
      { wrapperSelector: 'kendo-multiselect', popupToggleSelector: 'input.k-input-inner' },
      { wrapperSelector: 'kendo-datepicker', popupToggleSelector: '.k-input-button' },
      {
        wrapperSelector: 'kendo-grid',
        grid: {
          nextPageSelector: '[aria-label="Go to the next page"]',
          previousPageSelector: '[aria-label="Go to the previous page"]',
          scrollContainerSelector: '.k-grid-container',
        },
      },
    ]);
    expect(listWidgetTargets(KENDO_JQUERY_PROFILE).map((target) => target.wrapperSelector)).toEqual([
      'span.k-dropdownlist',
      'span.k-combobox',
      'span.k-multiselect',
      'span.k-datepicker',
      'div.k-grid',
    ]);
  });

  it('lists nothing for a profile whose widgets have no actions, or without a profile', () => {
    expect(listWidgetTargets(SYNTHETIC_PROFILE)).toEqual([]);
    expect(listWidgetTargets(undefined)).toEqual([]);
  });
});
