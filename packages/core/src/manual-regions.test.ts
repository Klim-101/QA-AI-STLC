// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { applyManualRegions, extractManualRegions } from './manual-regions.js';

describe('extractManualRegions', () => {
  it('returns an empty array for a source with no manual markers', () => {
    expect(extractManualRegions('export function login() {}\n')).toEqual([]);
  });

  it('extracts one region with its preserved content', () => {
    const source = [
      "import { test } from '@playwright/test';",
      '// qa:manual:start custom-assertion',
      'expect(await page.title()).toBe("Checkout");',
      '// qa:manual:end custom-assertion',
    ].join('\n');

    expect(extractManualRegions(source)).toEqual([
      { id: 'custom-assertion', content: 'expect(await page.title()).toBe("Checkout");' },
    ]);
  });

  it('extracts several sibling regions in file order', () => {
    const source = [
      '// qa:manual:start first',
      'a();',
      '// qa:manual:end first',
      '// qa:manual:start second',
      'b();',
      '// qa:manual:end second',
    ].join('\n');

    expect(extractManualRegions(source)).toEqual([
      { id: 'first', content: 'a();' },
      { id: 'second', content: 'b();' },
    ]);
  });

  it('extracts a region with empty content', () => {
    const source = ['// qa:manual:start empty', '// qa:manual:end empty'].join('\n');

    expect(extractManualRegions(source)).toEqual([{ id: 'empty', content: '' }]);
  });

  it('throws on a start marker with no id', () => {
    expect(() => extractManualRegions('// qa:manual:start \n// qa:manual:end x')).toThrow(
      '"qa:manual:start" has no id',
    );
  });

  it('throws on a nested start marker', () => {
    const source = ['// qa:manual:start a', '// qa:manual:start b', '// qa:manual:end a'].join('\n');

    expect(() => extractManualRegions(source)).toThrow('opens before');
  });

  it('throws on an end marker with no matching start', () => {
    expect(() => extractManualRegions('// qa:manual:end a')).toThrow('has no matching');
  });

  it('throws on a mismatched end marker id', () => {
    const source = ['// qa:manual:start a', '// qa:manual:end b'].join('\n');

    expect(() => extractManualRegions(source)).toThrow('does not match the open');
  });

  it('throws on a duplicate region id', () => {
    const source = [
      '// qa:manual:start a',
      '// qa:manual:end a',
      '// qa:manual:start a',
      '// qa:manual:end a',
    ].join('\n');

    expect(() => extractManualRegions(source)).toThrow('duplicate');
  });

  it('throws on an unclosed region', () => {
    expect(() => extractManualRegions('// qa:manual:start a')).toThrow('is never closed');
  });
});

describe('applyManualRegions', () => {
  it('splices a preserved region into its matching marker', () => {
    const template = [
      "import { test } from '@playwright/test';",
      '// qa:manual:start custom-assertion',
      '// TODO: add your own assertion',
      '// qa:manual:end custom-assertion',
    ].join('\n');

    const result = applyManualRegions(template, [
      { id: 'custom-assertion', content: 'expect(await page.title()).toBe("Checkout");' },
    ]);

    expect(result).toBe(
      [
        "import { test } from '@playwright/test';",
        '// qa:manual:start custom-assertion',
        'expect(await page.title()).toBe("Checkout");',
        '// qa:manual:end custom-assertion',
      ].join('\n'),
    );
  });

  it('keeps the template’s own placeholder when no existing region matches', () => {
    const template = [
      '// qa:manual:start custom-assertion',
      '// TODO',
      '// qa:manual:end custom-assertion',
    ].join('\n');

    expect(applyManualRegions(template, [])).toBe(template);
  });

  it('is a no-op on a template with no markers', () => {
    const template = 'export function login() {}';

    expect(applyManualRegions(template, [])).toBe(template);
  });

  it('throws when a preserved region has no marker left in the template', () => {
    const template = 'export function login() {}';

    expect(() => applyManualRegions(template, [{ id: 'gone', content: 'x();' }])).toThrow(
      'no longer has a "qa:manual" marker',
    );
  });

  it('throws when the caller passes duplicate region ids', () => {
    const template = ['// qa:manual:start a', '// qa:manual:end a'].join('\n');

    expect(() =>
      applyManualRegions(template, [
        { id: 'a', content: 'x();' },
        { id: 'a', content: 'y();' },
      ]),
    ).toThrow('duplicate');
  });
});
