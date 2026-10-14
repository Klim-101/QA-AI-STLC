// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { SCHEMA_VERSION } from '@qa-ai-stlc/schemas';
import type { LocatorCandidate, SelectorElement, SelectorRegistry } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import type { ComponentLibraryProfiles } from './component-library-profile.js';
import { generateLocatorModule } from './generate-locator-module.js';

function selectorElement(overrides: Partial<SelectorElement> = {}): SelectorElement {
  return {
    elementId: 'element-1',
    name: 'submit',
    kind: 'button',
    locatorCandidates: [{ strategy: 'testId', value: 'submit-button', fragile: false }],
    stabilityScore: 1,
    lastVerifiedAt: '2026-09-18T00:00:00Z',
    pii: false,
    dynamicText: false,
    source: 'crawl',
    ...overrides,
  };
}

function testId(value: string): LocatorCandidate {
  return { strategy: 'testId', value, fragile: false };
}

function registry(elements: readonly SelectorElement[]): SelectorRegistry {
  return { schemaVersion: SCHEMA_VERSION, generatedAt: '2026-09-18T00:00:00Z', elements: [...elements] };
}

describe('generateLocatorModule', () => {
  it('renders a getByTestId call for a testId candidate', () => {
    const { source } = generateLocatorModule(registry([selectorElement()]), { generatorVersion: '0.3.0' });

    expect(source).toContain('export function submit(page: Page): Locator {');
    expect(source).toContain('return page.getByTestId("submit-button");');
  });

  it('renders a getByRole call with the parsed role and accessible name', () => {
    const element = selectorElement({
      locatorCandidates: [
        { strategy: 'role', value: JSON.stringify({ role: 'button', name: 'Log in' }), fragile: false },
      ],
    });

    const { source } = generateLocatorModule(registry([element]), { generatorVersion: '0.3.0' });

    expect(source).toContain('page.getByRole("button", { name: "Log in" });');
  });

  it('renders getByLabel, getByPlaceholder, getByText and css candidates', () => {
    const strategies = [
      { strategy: 'label', value: 'Email' },
      { strategy: 'placeholder', value: 'you@example.com' },
      { strategy: 'text', value: 'Continue' },
      { strategy: 'css', value: '#submit' },
    ] as const;

    const elements = strategies.map((candidate, index) =>
      selectorElement({
        elementId: `element-${String(index)}`,
        name: `element${String(index)}`,
        locatorCandidates: [{ ...candidate, fragile: candidate.strategy === 'css' }],
      }),
    );

    const { source } = generateLocatorModule(registry(elements), { generatorVersion: '0.3.0' });

    expect(source).toContain('page.getByLabel("Email");');
    expect(source).toContain('page.getByPlaceholder("you@example.com");');
    expect(source).toContain('page.getByText("Continue");');
    expect(source).toContain('page.locator("#submit");');
  });

  it('stamps the generator version into the header and GENERATOR_VERSION export', () => {
    const { source } = generateLocatorModule(registry([selectorElement()]), { generatorVersion: '0.4.1' });

    expect(source).toContain('@qa-ai-stlc/explorer@0.4.1');
    expect(source).toContain('export const GENERATOR_VERSION = "0.4.1";');
  });

  it('orders exported functions by name regardless of registry order', () => {
    const elements = [
      selectorElement({ elementId: 'b', name: 'zebra', locatorCandidates: [testId('zebra')] }),
      selectorElement({ elementId: 'a', name: 'apple', locatorCandidates: [testId('apple')] }),
    ];

    const { source } = generateLocatorModule(registry(elements), { generatorVersion: '0.3.0' });

    expect(source.indexOf('function apple')).toBeLessThan(source.indexOf('function zebra'));
  });

  it('produces the same source for the same registry, twice', () => {
    const oneRegistry = registry([selectorElement()]);

    const first = generateLocatorModule(oneRegistry, { generatorVersion: '0.3.0' });
    const second = generateLocatorModule(oneRegistry, { generatorVersion: '0.3.0' });

    expect(first.source).toBe(second.source);
  });

  it('reports an element with no locator candidate as missing instead of generating for it', () => {
    const element = selectorElement({ locatorCandidates: [] });

    const { source, missingLocators } = generateLocatorModule(registry([element]), {
      generatorVersion: '0.3.0',
    });

    expect(source).not.toContain('function submit');
    expect(missingLocators).toEqual([
      { elementId: 'element-1', kind: 'button', reason: 'no-locator-candidate' },
    ]);
  });

  it('reports an element with no assigned name as missing', () => {
    const element = selectorElement({ name: undefined });

    const { missingLocators } = generateLocatorModule(registry([element]), { generatorVersion: '0.3.0' });

    expect(missingLocators).toEqual([{ elementId: 'element-1', kind: 'button', reason: 'no-name' }]);
  });

  it('sorts multiple missing elements by elementId', () => {
    const elements = [
      selectorElement({ elementId: 'z', name: undefined }),
      selectorElement({ elementId: 'a', name: undefined }),
    ];

    const { missingLocators } = generateLocatorModule(registry(elements), { generatorVersion: '0.3.0' });

    expect(missingLocators).toEqual([
      { elementId: 'a', kind: 'button', reason: 'no-name' },
      { elementId: 'z', kind: 'button', reason: 'no-name' },
    ]);
  });

  it('throws a QaError for a role candidate whose value is not a {role, name} pair', () => {
    const element = selectorElement({
      locatorCandidates: [{ strategy: 'role', value: JSON.stringify({ role: 'button' }), fragile: false }],
    });

    expect(() => generateLocatorModule(registry([element]), { generatorVersion: '0.3.0' })).toThrow(
      /role candidate value is not a \{role, name\} pair/,
    );
  });

  it('throws a QaError for an unknown locator strategy', () => {
    const element = selectorElement({
      locatorCandidates: [{ strategy: 'xpath', value: '//button', fragile: true }],
    });

    expect(() => generateLocatorModule(registry([element]), { generatorVersion: '0.3.0' })).toThrow(
      /unknown locator strategy: xpath/,
    );
  });

  it('matches the golden file for a small multi-strategy registry', () => {
    const elements = [
      selectorElement({
        elementId: 'a',
        name: 'logIn',
        locatorCandidates: [{ strategy: 'testId', value: 'login-button', fragile: false }],
      }),
      selectorElement({
        elementId: 'b',
        name: 'cancel',
        locatorCandidates: [
          { strategy: 'role', value: JSON.stringify({ role: 'button', name: 'Cancel' }), fragile: false },
        ],
      }),
      selectorElement({ elementId: 'c', name: undefined, locatorCandidates: [] }),
    ];

    const { source } = generateLocatorModule(registry(elements), { generatorVersion: '0.3.0' });

    expect(source).toMatchSnapshot();
  });

  it('skips a deprecated element entirely, not even as missing', () => {
    const element = selectorElement({ deprecatedAt: '2026-09-17T00:00:00Z' });

    const { source, missingLocators } = generateLocatorModule(registry([element]), {
      generatorVersion: '0.3.0',
    });

    expect(source).not.toContain('function submit');
    expect(missingLocators).toEqual([]);
  });

  describe('identical and session-added locators (P6-90)', () => {
    it('writes one function for elements that share a locator and keeps the unsuffixed name', () => {
      const elements = [
        selectorElement({ elementId: 'row-3', name: 'copyButton3' }),
        selectorElement({ elementId: 'row-1', name: 'copyButton' }),
        selectorElement({ elementId: 'row-2', name: 'copyButton2' }),
      ];

      const { source, sharedLocators, missingLocators } = generateLocatorModule(registry(elements), {
        generatorVersion: '0.3.0',
      });

      expect(source.match(/export function /g)).toHaveLength(1);
      expect(source).toContain('export function copyButton(page: Page): Locator');
      expect(sharedLocators).toEqual([
        { elementId: 'row-2', exportName: 'copyButton' },
        { elementId: 'row-3', exportName: 'copyButton' },
      ]);
      expect(missingLocators).toEqual([]);
    });

    it('writes above each function the elements it answers, shared ones included', () => {
      const elements = [
        selectorElement({ elementId: 'row-3', name: 'copyButton3' }),
        selectorElement({ elementId: 'row-1', name: 'copyButton' }),
        selectorElement({ elementId: 'other', name: 'other', locatorCandidates: [testId('other')] }),
      ];

      const { source } = generateLocatorModule(registry(elements), { generatorVersion: '0.3.0' });

      expect(source).toContain('// elements: row-1 row-3\nexport function copyButton(page: Page): Locator');
      expect(source).toContain('// elements: other\nexport function other(page: Page): Locator');
    });

    it('keeps two different locators apart and suffixes the later one when their names collide', () => {
      const elements = [
        selectorElement({ elementId: 'a', name: 'save', locatorCandidates: [testId('save-a')] }),
        selectorElement({ elementId: 'b', name: 'save', locatorCandidates: [testId('save-b')] }),
      ];

      const { source } = generateLocatorModule(registry(elements), { generatorVersion: '0.3.0' });

      expect(source).toContain(
        'export function save(page: Page): Locator {\n  return page.getByTestId("save-a");',
      );
      expect(source).toContain(
        'export function save2(page: Page): Locator {\n  return page.getByTestId("save-b");',
      );
    });

    it('accounts for every active element as an owner, a shared locator or a skip', () => {
      const elements = [
        selectorElement({ elementId: 'a', name: 'one' }),
        selectorElement({ elementId: 'b', name: 'two' }),
        selectorElement({ elementId: 'c', name: 'three', locatorCandidates: [testId('c')] }),
        selectorElement({ elementId: 'd', name: undefined, locatorCandidates: [testId('d')] }),
        selectorElement({ elementId: 'e', name: 'five', locatorCandidates: [] }),
        selectorElement({ elementId: 'f', name: 'six', deprecatedAt: '2026-09-19T00:00:00Z' }),
      ];

      const { source, sharedLocators, missingLocators } = generateLocatorModule(registry(elements), {
        generatorVersion: '0.3.0',
      });

      const functionCount = source.match(/^export function /gm)?.length ?? 0;
      expect(functionCount + sharedLocators.length + missingLocators.length).toBe(5);
    });

    it('turns a session-added selector into a page.locator call', () => {
      const element = selectorElement({
        name: 'lastGwHeader',
        source: 'execute',
        locatorCandidates: [
          { strategy: 'execute', value: 'role=columnheader[name="Last GW ID"]', fragile: true },
        ],
      });

      const { source, missingLocators } = generateLocatorModule(registry([element]), {
        generatorVersion: '0.3.0',
      });

      expect(source).toContain('return page.locator("role=columnheader[name=\\"Last GW ID\\"]");');
      expect(missingLocators).toEqual([]);
    });

    it.each([
      ['role=columnheader[name="Last GW ID"]', 'columnheaderLastGwId'],
      ['role=button', 'button'],
      ['text=Save changes', 'saveChanges'],
      ['#orders .row', 'ordersRow'],
    ])('names an unnamed session-added element after its selector (%s)', (selector, expectedName) => {
      const element = selectorElement({
        name: undefined,
        kind: 'button',
        source: 'execute',
        locatorCandidates: [{ strategy: 'execute', value: selector, fragile: true }],
      });

      const { source, missingLocators } = generateLocatorModule(registry([element]), {
        generatorVersion: '0.3.0',
      });

      expect(source).toContain(`export function ${expectedName}(page: Page): Locator`);
      expect(missingLocators).toEqual([]);
    });
  });

  describe('grid rows and cells (P6-90)', () => {
    const grid = (overrides: Partial<SelectorElement> = {}): SelectorElement =>
      selectorElement({ name: 'nodes', kind: 'grid', library: 'kendo-angular', ...overrides });

    it('renders a row helper by row text and a cell helper by column name', () => {
      const { source } = generateLocatorModule(registry([grid()]), { generatorVersion: '0.3.0' });

      expect(source).toContain('export function nodesRow(page: Page, rowText: string): Locator {');
      expect(source).toContain('nodes(page).getByRole("row").filter({ hasText: rowText })');
      expect(source).toContain(
        'export async function nodesCell(page: Page, rowText: string, columnName: string): Promise<Locator> {',
      );
      expect(source).toContain('getAttribute("aria-colindex")');
      expect(source).not.toContain('widgetRoot');
    });

    it('renders no grid helper for a kind without grid controls', () => {
      const { source } = generateLocatorModule(registry([grid({ kind: 'tabstrip' })]), {
        generatorVersion: '0.3.0',
      });

      expect(source).not.toContain('nodesRow');
    });
  });

  describe('widget helpers (P6-43)', () => {
    const widget = (overrides: Partial<SelectorElement> = {}): SelectorElement =>
      selectorElement({ name: 'status', kind: 'dropdownlist', library: 'kendo-jquery', ...overrides });

    it('renders a select helper for a drop-down and the runtime it calls', () => {
      const { source } = generateLocatorModule(registry([widget()]), { generatorVersion: '0.3.0' });

      expect(source).toContain(
        'export async function statusSelectOption(page: Page, optionText: string): Promise<void> {\n  await selectWidgetOption(widgetRoot(status(page), "span.k-dropdownlist"), optionText);\n}',
      );
      expect(source).toContain('export async function statusOpenPopup(page: Page): Promise<void> {');
      expect(source).toContain(
        'await setWidgetPopup(widgetRoot(status(page), "span.k-dropdownlist"), false);',
      );
      expect(source).toContain('async function selectWidgetOption(');
      expect(source).not.toContain('statusSetDate');
    });

    it('renders a date helper for a date picker and passes the popup toggle on', () => {
      const { source } = generateLocatorModule(registry([widget({ name: 'due', kind: 'datepicker' })]), {
        generatorVersion: '0.3.0',
      });

      expect(source).toContain('await setWidgetDate(widgetRoot(due(page), "span.k-datepicker"), value);');
      expect(source).toContain(
        'await setWidgetPopup(widgetRoot(due(page), "span.k-datepicker"), true, ".k-input-button, .k-select");',
      );
      expect(source).not.toContain('dueSelectOption');
    });

    it('tells the date helper to type the digits for a segmented date input', () => {
      const { source } = generateLocatorModule(
        registry([widget({ name: 'due', kind: 'datepicker', library: 'kendo-angular' })]),
        { generatorVersion: '0.3.0' },
      );

      expect(source).toContain(
        'await setWidgetDate(widgetRoot(due(page), "kendo-datepicker"), value, "digits");',
      );
    });

    it('renders no helper and no runtime for an element without a library, or a kind without actions', () => {
      const elements = [
        widget({ name: 'plain', library: undefined }),
        widget({ elementId: 'element-2', name: 'tabs', kind: 'tabstrip' }),
        widget({ elementId: 'element-3', name: 'other', library: 'made-up' }),
      ];

      const { source } = generateLocatorModule(registry(elements), { generatorVersion: '0.3.0' });

      expect(source).not.toContain('SelectOption');
      expect(source).not.toContain('WIDGET_TIMEOUT_MS');
    });

    it('does not let a helper replace the locator function of an element with the same name', () => {
      const elements = [
        widget(),
        selectorElement({
          elementId: 'element-2',
          name: 'statusOpenPopup',
          locatorCandidates: [testId('other')],
        }),
      ];

      const { source } = generateLocatorModule(registry(elements), { generatorVersion: '0.3.0' });

      expect(source.match(/function statusOpenPopup\(/g)).toHaveLength(1);
      expect(source).toContain('function statusOpenPopup(page: Page): Locator');
      expect(source).toContain('function statusClosePopup(page: Page): Promise<void>');
    });

    it('takes the helpers from the profiles it is given', () => {
      const profiles: ComponentLibraryProfiles = {
        'kendo-jquery': {
          id: 'kendo-jquery',
          widgets: [
            { widgetKind: 'dropdownlist', wrapperSelector: '.x', role: 'combobox', actions: ['popup'] },
          ],
          generatedIdPatterns: [],
          busySelectors: [],
        },
      };

      const { source } = generateLocatorModule(registry([widget()]), { generatorVersion: '0.3.0', profiles });

      expect(source).toContain('await setWidgetPopup(widgetRoot(status(page), ".x"), true);');
      expect(source).not.toContain('statusSelectOption');
    });
  });
});
