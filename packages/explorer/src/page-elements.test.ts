// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { AuthPage } from '@qa-ai-stlc/core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_NORMALIZE_LIMITS } from './normalize.js';
import { extractPageElements } from './page-elements.js';

function fakePage(evaluateResult: unknown): AuthPage {
  return {
    goto: () => Promise.resolve(null),
    fill: () => Promise.resolve(),
    click: () => Promise.resolve(),
    waitForLoadState: () => Promise.resolve(),
    route: () => Promise.resolve(),
    evaluate: () => Promise.resolve(evaluateResult),
    ariaSnapshotJSON: () => Promise.resolve(undefined),
  };
}

describe('extractPageElements', () => {
  it('normalizes a well-formed set of raw page elements', async () => {
    const page = fakePage({
      interactiveElements: [{ kind: 'button', accessibleName: 'Save', testId: 'save-button' }],
      forms: [
        { action: '/tasks', method: 'post', fields: [{ name: 'title', type: 'text', required: true }] },
      ],
      tables: [{ columnHeaders: ['Title', 'Status'], rowCount: 3 }],
      dialogs: [{ accessibleName: 'Edit task', open: false }],
    });

    const result = await extractPageElements(page, DEFAULT_NORMALIZE_LIMITS);

    expect(result).toEqual({
      interactiveElements: [{ kind: 'button', accessibleName: 'Save', testId: 'save-button' }],
      forms: [
        { action: '/tasks', method: 'post', fields: [{ name: 'title', type: 'text', required: true }] },
      ],
      tables: [{ columnHeaders: ['Title', 'Status'], rowCount: 3 }],
      dialogs: [{ accessibleName: 'Edit task', open: false }],
      truncated: false,
    });
  });

  it('drops an interactive element with an unrecognized kind', async () => {
    const page = fakePage({
      interactiveElements: [
        { kind: 'video', accessibleName: undefined, testId: undefined },
        { kind: 'link', accessibleName: undefined, testId: undefined },
      ],
      forms: [],
      tables: [],
      dialogs: [],
    });

    const result = await extractPageElements(page, DEFAULT_NORMALIZE_LIMITS);

    expect(result.interactiveElements).toEqual([{ kind: 'link' }]);
  });

  it('omits optional fields a form field does not have', async () => {
    const page = fakePage({
      interactiveElements: [],
      forms: [
        {
          action: undefined,
          method: 'get',
          fields: [{ name: undefined, type: 'checkbox', required: false }],
        },
      ],
      tables: [],
      dialogs: [],
    });

    const result = await extractPageElements(page, DEFAULT_NORMALIZE_LIMITS);

    expect(result.forms).toEqual([{ method: 'get', fields: [{ type: 'checkbox', required: false }] }]);
  });

  it('returns empty, truncated results when evaluate does not resolve to the expected shape', async () => {
    const page = fakePage(undefined);

    const result = await extractPageElements(page, DEFAULT_NORMALIZE_LIMITS);

    expect(result).toEqual({ interactiveElements: [], forms: [], tables: [], dialogs: [], truncated: true });
  });

  it('caps oversized element lists and reports truncation', async () => {
    const manyButtons = Array.from({ length: 3 }, () => ({
      kind: 'button',
      accessibleName: undefined,
      testId: undefined,
    }));
    const page = fakePage({ interactiveElements: manyButtons, forms: [], tables: [], dialogs: [] });

    const result = await extractPageElements(page, {
      maxTextLength: 200,
      maxArrayLength: 2,
      maxTreeNodes: 500,
    });

    expect(result.interactiveElements).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it('caps oversized forms, tables and dialogs lists and reports truncation', async () => {
    const manyForms = Array.from({ length: 3 }, () => ({ action: undefined, method: 'get', fields: [] }));
    const manyTables = Array.from({ length: 3 }, () => ({ columnHeaders: [], rowCount: 0 }));
    const manyDialogs = Array.from({ length: 3 }, () => ({ accessibleName: undefined, open: false }));
    const page = fakePage({
      interactiveElements: [],
      forms: manyForms,
      tables: manyTables,
      dialogs: manyDialogs,
    });

    const result = await extractPageElements(page, {
      maxTextLength: 200,
      maxArrayLength: 2,
      maxTreeNodes: 500,
    });

    expect(result.forms).toHaveLength(2);
    expect(result.tables).toHaveLength(2);
    expect(result.dialogs).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it('truncates an interactive element accessible name, a table header and a dialog name', async () => {
    const limits = { maxTextLength: 4, maxArrayLength: 200, maxTreeNodes: 500 };
    const page = fakePage({
      interactiveElements: [{ kind: 'button', accessibleName: 'a very long label', testId: undefined }],
      forms: [],
      tables: [{ columnHeaders: ['a very long header'], rowCount: 0 }],
      dialogs: [{ accessibleName: 'a very long dialog name', open: true }],
    });

    const result = await extractPageElements(page, limits);

    expect(result.interactiveElements[0]?.accessibleName).toBe('a ve…');
    expect(result.tables[0]?.columnHeaders[0]).toBe('a ve…');
    expect(result.dialogs[0]?.accessibleName).toBe('a ve…');
    expect(result.truncated).toBe(true);
  });
});
