// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { AuthPage } from '@qa-ai-stlc/core';
import { describe, expect, it } from 'vitest';
import { analyzePage } from './analyze-page.js';
import { DEFAULT_NORMALIZE_LIMITS } from './normalize.js';

function fakePage(options: { readonly ariaSnapshot?: unknown; readonly elements?: unknown }): AuthPage {
  return {
    goto: () => Promise.resolve(null),
    fill: () => Promise.resolve(),
    click: () => Promise.resolve(),
    waitForLoadState: () => Promise.resolve(),
    route: () => Promise.resolve(),
    evaluate: () => Promise.resolve(options.elements),
    ariaSnapshotJSON: () => Promise.resolve(options.ariaSnapshot),
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

    const model = await analyzePage(page, 'https://staging.example.com/tasks', DEFAULT_NORMALIZE_LIMITS);

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

    const model = await analyzePage(page, 'https://staging.example.com/', DEFAULT_NORMALIZE_LIMITS);

    expect(model.truncated).toBe(true);
  });
});
