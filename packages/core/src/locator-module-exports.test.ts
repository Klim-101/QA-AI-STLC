// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { QaError } from './errors.js';
import { parseLocatorModuleExports } from './locator-module-exports.js';

const FUNCTION_BODY = ['  return page.getByTestId("x");', '}'];

function moduleSource(...blocks: readonly (readonly string[])[]): string {
  return ['export const GENERATOR_VERSION = "1.0.0";', '', ...blocks.flatMap((block) => [...block, ''])].join(
    '\n',
  );
}

describe('parseLocatorModuleExports', () => {
  it('maps every element a function answers to that function, sorted by element id', () => {
    const source = moduleSource(
      ['// elements: b a', 'export function save(page: Page): Locator {', ...FUNCTION_BODY],
      ['// elements: c', 'export function cancel(page: Page): Locator {', ...FUNCTION_BODY],
    );

    expect(parseLocatorModuleExports(source)).toEqual([
      { elementId: 'a', name: 'save' },
      { elementId: 'b', name: 'save' },
      { elementId: 'c', name: 'cancel' },
    ]);
  });

  it('ignores widget and grid helpers, which take more than the page', () => {
    const source = moduleSource(
      ['// elements: a', 'export function nodes(page: Page): Locator {', ...FUNCTION_BODY],
      ['export function nodesRow(page: Page, rowText: string): Locator {', ...FUNCTION_BODY],
      ['export async function statusOpenPopup(page: Page): Promise<void> {', '}'],
    );

    expect(parseLocatorModuleExports(source)).toEqual([{ elementId: 'a', name: 'nodes' }]);
  });

  it('is empty for a module with no functions', () => {
    expect(parseLocatorModuleExports(moduleSource())).toEqual([]);
  });

  it('refuses a function with no element marker, which an older generator wrote', () => {
    const source = moduleSource(['export function save(page: Page): Locator {', ...FUNCTION_BODY]);

    const error = (() => {
      try {
        parseLocatorModuleExports(source);
      } catch (caught) {
        return caught;
      }
      return undefined;
    })();

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('GENERATION_LOCATOR_MODULE_OUTDATED');
  });

  it('does not let a marker carry over to a later function', () => {
    const source = moduleSource(
      ['// elements: a', 'export function save(page: Page): Locator {', ...FUNCTION_BODY],
      ['export function cancel(page: Page): Locator {', ...FUNCTION_BODY],
    );

    expect(() => parseLocatorModuleExports(source)).toThrow(QaError);
  });
});
