// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { InteractiveElement } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { synthesizeLocatorCandidates } from './synthesize-locators.js';

function element(overrides: Partial<InteractiveElement> = {}): InteractiveElement {
  return { kind: 'input', tagName: 'input', nthOfType: 1, ...overrides };
}

describe('synthesizeLocatorCandidates', () => {
  it('orders candidates role, testId, label, placeholder, text, css under playwright-default', () => {
    const candidates = synthesizeLocatorCandidates(
      element({
        accessibleName: 'Save',
        testId: 'save-button',
        role: 'button',
        label: 'Save label',
        placeholder: 'Save placeholder',
        htmlId: 'save',
      }),
      'playwright-default',
    );

    expect(candidates.map((candidate) => candidate.strategy)).toEqual([
      'role',
      'testId',
      'label',
      'placeholder',
      'text',
      'css',
    ]);
  });

  it('puts testId before role under testid-first', () => {
    const candidates = synthesizeLocatorCandidates(
      element({ testId: 'save-button', role: 'button', accessibleName: 'Save' }),
      'testid-first',
    );

    expect(candidates.map((candidate) => candidate.strategy)).toEqual(['testId', 'role', 'text', 'css']);
  });

  it('never emits a css candidate under strict-no-css', () => {
    const candidates = synthesizeLocatorCandidates(
      element({ testId: 'save-button', htmlId: 'save' }),
      'strict-no-css',
    );

    expect(candidates.map((candidate) => candidate.strategy)).not.toContain('css');
  });

  it('produces zero candidates under strict-no-css when no non-css signal is available', () => {
    const candidates = synthesizeLocatorCandidates(element(), 'strict-no-css');

    expect(candidates).toEqual([]);
  });

  it('every element gets at least one candidate under playwright-default via the css fallback', () => {
    const candidates = synthesizeLocatorCandidates(element(), 'playwright-default');

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual({ strategy: 'css', value: 'input:nth-of-type(1)', fragile: true });
  });

  it('skips the role candidate when role is present but no accessible name or label is', () => {
    const candidates = synthesizeLocatorCandidates(element({ role: 'textbox' }), 'playwright-default');

    expect(candidates.map((candidate) => candidate.strategy)).not.toContain('role');
  });

  it('builds the role candidate from the label when no accessible name is present', () => {
    const candidates = synthesizeLocatorCandidates(
      element({ role: 'textbox', label: 'Email' }),
      'playwright-default',
    );

    expect(candidates[0]).toEqual({
      strategy: 'role',
      value: JSON.stringify({ role: 'textbox', name: 'Email' }),
      fragile: false,
    });
  });

  it('uses a #id css candidate for a CSS-safe html id', () => {
    const candidates = synthesizeLocatorCandidates(element({ htmlId: 'email' }), 'playwright-default');

    expect(candidates[0]).toEqual({ strategy: 'css', value: '#email', fragile: true });
  });

  it('falls back to nth-of-type when the html id is not a safe CSS identifier', () => {
    const candidates = synthesizeLocatorCandidates(
      element({ htmlId: '2 unsafe id!', tagName: 'input', nthOfType: 3 }),
      'playwright-default',
    );

    expect(candidates[0]).toEqual({ strategy: 'css', value: 'input:nth-of-type(3)', fragile: true });
  });

  it('prefers a configured extra stable attribute over the id css fallback (P6-23)', () => {
    const candidates = synthesizeLocatorCandidates(
      element({ htmlId: 'email', extraAttributeValues: { 'data-qa': 'email-field' } }),
      'playwright-default',
      { extraStableAttributes: ['data-qa'] },
    );

    expect(candidates[0]).toEqual({ strategy: 'css', value: '[data-qa="email-field"]', fragile: true });
  });

  it('tries extraStableAttributes in order and falls through to the id when none has a value', () => {
    const candidates = synthesizeLocatorCandidates(
      element({ htmlId: 'email', extraAttributeValues: { 'data-cy': 'email-field' } }),
      'playwright-default',
      { extraStableAttributes: ['data-qa', 'data-cy'] },
    );

    expect(candidates[0]).toEqual({ strategy: 'css', value: '[data-cy="email-field"]', fragile: true });
  });

  it('escapes a double quote and a backslash in an extra attribute value (P6-23)', () => {
    const candidates = synthesizeLocatorCandidates(
      element({ extraAttributeValues: { 'data-qa': 'a "quoted" \\ value' } }),
      'playwright-default',
      { extraStableAttributes: ['data-qa'] },
    );

    expect(candidates[0]).toEqual({
      strategy: 'css',
      value: '[data-qa="a \\"quoted\\" \\\\ value"]',
      fragile: true,
    });
  });

  it('never uses an id matching a configured generatedIdPatterns entry (P6-23)', () => {
    const candidates = synthesizeLocatorCandidates(
      element({ htmlId: 'r-abc123', tagName: 'input', nthOfType: 2 }),
      'playwright-default',
      { generatedIdPatterns: [/^r-[a-z0-9]+$/] },
    );

    expect(candidates[0]).toEqual({ strategy: 'css', value: 'input:nth-of-type(2)', fragile: true });
  });

  it('still uses a css-safe id that matches none of the configured generatedIdPatterns', () => {
    const candidates = synthesizeLocatorCandidates(element({ htmlId: 'email' }), 'playwright-default', {
      generatedIdPatterns: [/^r-[a-z0-9]+$/],
    });

    expect(candidates[0]).toEqual({ strategy: 'css', value: '#email', fragile: true });
  });

  it('marks every css candidate fragile and every other strategy not fragile', () => {
    const candidates = synthesizeLocatorCandidates(
      element({
        accessibleName: 'Save',
        testId: 'save-button',
        role: 'button',
        label: 'Save label',
        placeholder: 'Save placeholder',
      }),
      'playwright-default',
    );

    for (const candidate of candidates) {
      expect(candidate.fragile).toBe(candidate.strategy === 'css');
    }
  });

  it('locates a widget through its popup id instead of its position (P6-40)', () => {
    const candidates = synthesizeLocatorCandidates(
      element({ kind: 'widget', widgetKind: 'dropdownlist', popupId: 'status_listbox', nthOfType: 4 }),
      'playwright-default',
    );

    expect(candidates).toEqual([
      {
        strategy: 'css',
        value: '[aria-controls="status_listbox"], [aria-owns="status_listbox"]',
        fragile: true,
      },
    ]);
  });

  it('escapes a quote in a popup id and skips a generated one', () => {
    const quoted = synthesizeLocatorCandidates(element({ popupId: 'a"b' }), 'strict-no-css');
    const quotedCss = synthesizeLocatorCandidates(element({ popupId: 'a"b' }), 'playwright-default');
    const generated = synthesizeLocatorCandidates(
      element({ popupId: 'syn-4821', nthOfType: 2 }),
      'playwright-default',
      { generatedIdPatterns: [/^syn-\d+$/] },
    );

    expect(quoted).toEqual([]);
    expect(quotedCss[0]?.value).toBe('[aria-controls="a\\"b"], [aria-owns="a\\"b"]');
    expect(generated[0]?.value).toBe('input:nth-of-type(2)');
  });
});
