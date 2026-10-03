// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  diffPageViews,
  MAX_PAGE_VIEW_CHARS,
  PAGE_VIEW_BEGIN_MARKER,
  PAGE_VIEW_END_MARKER,
  renderPageView,
} from './page-view.js';

function page(...children: { role: string; name?: string }[]): unknown {
  return { role: 'document', children };
}

describe('renderPageView entries and inherited refs (P6-54)', () => {
  it('lists each kept line with and without its ref', () => {
    const view = renderPageView(page({ role: 'button', name: 'Go' }, { role: 'heading', name: 'Hi' }));

    expect(view.entries).toEqual([
      { key: '- document', text: '- document' },
      {
        key: '  - button "Go"',
        text: '  - button "Go" [ref=e1]',
        ref: { ref: 'e1', role: 'button', name: 'Go', isNameTruncated: false },
      },
      { key: '  - heading "Hi"', text: '  - heading "Hi"' },
    ]);
  });

  it('keeps an inherited ref for the same line, in order, and mints a new number for the rest', () => {
    const earlier = renderPageView(page({ role: 'button', name: 'Go' }, { role: 'button', name: 'Go' }));
    const inherited = new Map([['  - button "Go"', earlier.refs]]);

    const later = renderPageView(
      page({ role: 'button', name: 'Go' }, { role: 'button', name: 'Go' }, { role: 'button', name: 'Go' }),
      undefined,
      3,
      inherited,
    );

    expect(later.refs.map((ref) => ref.ref)).toEqual(['e1', 'e2', 'e3']);
  });

  it('mints a new number for a line nobody had a ref on', () => {
    const later = renderPageView(
      page({ role: 'button', name: 'New' }),
      undefined,
      5,
      new Map([['  - button "Old"', [{ ref: 'e1', role: 'button', name: 'Old', isNameTruncated: false }]]]),
    );

    expect(later.refs.map((ref) => ref.ref)).toEqual(['e5']);
  });
});

describe('diffPageViews (P6-54)', () => {
  const entry = (key: string, ref?: string) => ({
    key,
    text: ref === undefined ? key : `${key} [ref=${ref}]`,
    ...(ref === undefined ? {} : { ref: { ref, role: 'button', isNameTruncated: false } }),
  });

  it('counts lines as a multiset: a repeated line only differs when its count does', () => {
    const diff = diffPageViews(
      [entry('- row'), entry('- row'), entry('- gone')],
      [entry('- row'), entry('- row'), entry('- row'), entry('- new', 'e4')],
    );

    expect(diff).toMatchObject({ addedCount: 2, removedCount: 1, unchangedCount: 2, truncated: false });
    expect(diff.text.split('\n')).toEqual([
      PAGE_VIEW_BEGIN_MARKER,
      '- - gone',
      '+ - row',
      '+ - new [ref=e4]',
      PAGE_VIEW_END_MARKER,
    ]);
  });

  it('is just the markers when nothing changed', () => {
    const diff = diffPageViews([entry('- a')], [entry('- a')]);

    expect(diff.text).toBe(`${PAGE_VIEW_BEGIN_MARKER}\n${PAGE_VIEW_END_MARKER}`);
    expect(diff).toMatchObject({ addedCount: 0, removedCount: 0, unchangedCount: 1 });
  });

  it('caps the changed lines and says how many it dropped', () => {
    const many = Array.from({ length: 2000 }, (_, index) =>
      entry(`- item ${String(index).padStart(5, '0')}`),
    );

    const diff = diffPageViews([], many);

    expect(diff.truncated).toBe(true);
    expect(diff.omittedLineCount).toBeGreaterThan(0);
    expect(diff.text.length).toBeLessThanOrEqual(MAX_PAGE_VIEW_CHARS);
    expect(diff.addedCount).toBe(2000);
  });
});
