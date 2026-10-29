// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { findUnsupportedSelectorEngine } from './selector-forms.js';

describe('findUnsupportedSelectorEngine', () => {
  it.each([
    '#status',
    'tr',
    '[data-testid="save"]',
    'input[name=email]',
    'a[href=x] >> text=Save',
    'role=button[name="Log in"]',
    'text=Save',
    'data-testid=save',
    'id=save',
    'css=.row',
    'xpath=//tr',
    '//tr[1]',
    '../td',
    '"Save"',
    "'Save'",
    '*css=.row >> text=x',
    'css:light=.row',
    'TEXT=Save',
    'role=row >> nth=0',
    '.row:has-text("a=b")',
    '',
  ])('accepts %s', (selector) => {
    expect(findUnsupportedSelectorEngine(selector)).toBeUndefined();
  });

  it.each([
    ['label=Title', 'label'],
    ['testid=save', 'testid'],
    ['placeholder=Name', 'placeholder'],
    ['css=.row >> label=Title', 'label'],
    ['  title=x', 'title'],
  ])('reports the engine of %s', (selector, engine) => {
    expect(findUnsupportedSelectorEngine(selector)).toBe(engine);
  });

  it('does not split on a ">>" inside quotes or after an escape', () => {
    expect(findUnsupportedSelectorEngine('text="a >> label=b"')).toBeUndefined();
    expect(findUnsupportedSelectorEngine('text="a\\" >> label=b"')).toBeUndefined();
    expect(findUnsupportedSelectorEngine("text='a >> label=b'")).toBeUndefined();
    expect(findUnsupportedSelectorEngine('text=`a >> label=b`')).toBeUndefined();
  });
});
