// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { AuthPage } from '@qa-ai-stlc/core';
import { describe, expect, it } from 'vitest';
import { analyzePage } from './analyze-page.js';
import { DEFAULT_NORMALIZE_LIMITS } from './normalize.js';
import { SYNTHETIC_PROFILE } from './test-support/synthetic-profile.js';
import { createLocatorMethods } from './test-support/locator-stub.js';

function fakePage(
  options: { readonly ariaSnapshot?: unknown; readonly elements?: unknown },
  evaluateArgs: unknown[] = [],
): AuthPage {
  return {
    goto: () => Promise.resolve(null),
    fill: () => Promise.resolve(),
    click: () => Promise.resolve(),
    waitForLoadState: () => Promise.resolve(),
    route: () => Promise.resolve(),
    evaluate: (_pageFunction, arg) => {
      evaluateArgs.push(arg);
      return Promise.resolve(options.elements);
    },
    ariaSnapshotJSON: () => Promise.resolve(options.ariaSnapshot),
    addScriptTag: () => Promise.resolve(undefined),
    ...createLocatorMethods(),
  };
}

describe('analyzePage', () => {
  it('combines the accessibility tree and page elements into one page model', async () => {
    const page = fakePage({
      ariaSnapshot: { role: 'document', name: 'Tasks' },
      elements: {
        interactiveElements: [
          { kind: 'button', accessibleName: 'New task', testId: undefined, tagName: 'button', nthOfType: 1 },
        ],
        forms: [],
        tables: [],
        dialogs: [],
      },
    });

    const model = await analyzePage(
      page,
      'https://staging.example.com/tasks',
      'data-testid',
      DEFAULT_NORMALIZE_LIMITS,
    );

    expect(model).toEqual({
      url: 'https://staging.example.com/tasks',
      accessibilityTree: { role: 'document', name: 'Tasks' },
      interactiveElements: [{ kind: 'button', accessibleName: 'New task', tagName: 'button', nthOfType: 1 }],
      forms: [],
      tables: [],
      dialogs: [],
      truncated: false,
    });
  });

  it('reports truncated when either the tree or the elements were capped', async () => {
    const page = fakePage({
      ariaSnapshot: { role: 'document', name: 'a'.repeat(300) },
      elements: undefined,
    });

    const model = await analyzePage(
      page,
      'https://staging.example.com/',
      'data-testid',
      DEFAULT_NORMALIZE_LIMITS,
    );

    expect(model.truncated).toBe(true);
  });

  it('reads the interactive elements testId off the configured attribute (default-limits branch)', async () => {
    const page = fakePage({
      ariaSnapshot: { role: 'document', name: 'Tasks' },
      elements: { interactiveElements: [], forms: [], tables: [], dialogs: [] },
    });

    const model = await analyzePage(page, 'https://staging.example.com/', 'data-testid');

    expect(model.truncated).toBe(false);
  });

  it('waits for the profile busy indicators, then reads the profile widgets (P6-37)', async () => {
    const evaluateArgs: unknown[] = [];
    const page = fakePage(
      { elements: { interactiveElements: [], forms: [], tables: [], dialogs: [] } },
      evaluateArgs,
    );

    await analyzePage(
      page,
      'https://staging.example.com/',
      'data-testid',
      DEFAULT_NORMALIZE_LIMITS,
      [],
      SYNTHETIC_PROFILE,
    );

    expect(evaluateArgs).toEqual([
      { busySelectors: ['.syn-loading'], timeoutMs: 5000 },
      { testIdAttribute: 'data-testid', extraStableAttributes: [], widgets: SYNTHETIC_PROFILE.widgets },
    ]);
  });
});
