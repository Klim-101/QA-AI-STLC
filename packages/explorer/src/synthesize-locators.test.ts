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
});
