// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { SCHEMA_VERSION } from '@qa-ai-stlc/schemas';
import type { SelectorElement, SelectorRegistry } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
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
      selectorElement({ elementId: 'b', name: 'zebra' }),
      selectorElement({ elementId: 'a', name: 'apple' }),
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
    expect(missingLocators).toEqual([{ elementId: 'element-1', kind: 'button' }]);
  });

  it('reports an element with no assigned name as missing', () => {
    const element = selectorElement({ name: undefined });

    const { missingLocators } = generateLocatorModule(registry([element]), { generatorVersion: '0.3.0' });

    expect(missingLocators).toEqual([{ elementId: 'element-1', kind: 'button' }]);
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
});
