// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Clock } from '@qa-ai-stlc/core';
import { describe, expect, it } from 'vitest';
import { analyzeStaticSource, type StaticSourceFile } from './analyze-static-source.js';

const FIXED_CLOCK: Clock = { now: () => new Date('2026-09-18T00:00:00.000Z') };

function file(filePath: string, content: string): StaticSourceFile {
  return { filePath, content };
}

describe('analyzeStaticSource', () => {
  it('extracts a button with a literal data-testid from JSX', () => {
    const { elements } = analyzeStaticSource({
      files: [file('src/components/LoginForm.tsx', '<button data-testid="login-button">Log in</button>')],
      clock: FIXED_CLOCK,
    });

    expect(elements).toEqual([
      expect.objectContaining({
        kind: 'button',
        source: 'static',
        sourceLocation: { filePath: 'src/components/LoginForm.tsx', line: 1 },
        locatorCandidates: [{ strategy: 'testId', value: 'login-button', fragile: false }],
        stabilityScore: 0,
        lastVerifiedAt: '2026-09-18T00:00:00.000Z',
      }),
    ]);
  });

  it('leaves pii/dynamicText unset rather than asserting a check that never ran (regression, #284)', () => {
    const { elements } = analyzeStaticSource({
      files: [file('src/App.tsx', '<button data-testid="submit"></button>')],
      clock: FIXED_CLOCK,
    });

    expect(elements[0]).not.toHaveProperty('pii');
    expect(elements[0]).not.toHaveProperty('dynamicText');
  });

  it('extracts a role+aria-label pair as a role locator candidate', () => {
    const { elements } = analyzeStaticSource({
      files: [file('src/App.vue', '<div role="button" aria-label="Close dialog"></div>')],
      clock: FIXED_CLOCK,
    });

    expect(elements[0]?.kind).toBe('button');
    expect(elements[0]?.locatorCandidates).toEqual([
      { strategy: 'role', value: JSON.stringify({ role: 'button', name: 'Close dialog' }), fragile: false },
    ]);
  });

  it('reports both a role candidate and a testId candidate when both are present', () => {
    const { elements } = analyzeStaticSource({
      files: [
        file('src/app.component.html', '<a role="link" aria-label="Home" data-testid="home-link">Home</a>'),
      ],
      clock: FIXED_CLOCK,
    });

    expect(elements[0]?.locatorCandidates).toEqual([
      { strategy: 'role', value: JSON.stringify({ role: 'link', name: 'Home' }), fragile: false },
      { strategy: 'testId', value: 'home-link', fragile: false },
    ]);
  });

  it('skips a tag it cannot classify into a known kind', () => {
    const { elements } = analyzeStaticSource({
      files: [file('src/App.tsx', '<div data-testid="wrapper"><span aria-label="icon" /></div>')],
      clock: FIXED_CLOCK,
    });

    expect(elements).toEqual([]);
  });

  it('records the 1-based line number of a tag past the first line', () => {
    const { elements } = analyzeStaticSource({
      files: [file('src/Form.tsx', '<div>\n  <input data-testid="email" />\n</div>')],
      clock: FIXED_CLOCK,
    });

    expect(elements[0]?.sourceLocation).toEqual({ filePath: 'src/Form.tsx', line: 2 });
  });

  it('does not capture a Vue-bound attribute as a literal value', () => {
    const { elements } = analyzeStaticSource({
      files: [file('src/App.vue', '<button :data-testid="dynamicId" aria-label="Submit"></button>')],
      clock: FIXED_CLOCK,
    });

    expect(elements[0]?.locatorCandidates).toEqual([]);
  });

  it('does not capture an Angular attribute binding as a literal value', () => {
    const { elements } = analyzeStaticSource({
      files: [file('src/app.component.html', '<button [attr.data-testid]="dynamicId"></button>')],
      clock: FIXED_CLOCK,
    });

    expect(elements[0]?.locatorCandidates).toEqual([]);
  });

  it('assigns and deduplicates camelCase names across files in one call', () => {
    const { elements } = analyzeStaticSource({
      files: [
        file('src/A.tsx', '<button data-testid="submit">Submit</button>'),
        file('src/B.tsx', '<button data-testid="submit-2" aria-label="Submit"></button>'),
      ],
      clock: FIXED_CLOCK,
    });

    expect(elements[0]?.name).toBe('submit');
    expect(elements[1]?.name).toBe('submit2');
  });

  it('reads a single-quoted literal attribute value', () => {
    const { elements } = analyzeStaticSource({
      files: [file('src/App.tsx', "<button data-testid='login-button'>Log in</button>")],
      clock: FIXED_CLOCK,
    });

    expect(elements[0]?.locatorCandidates).toEqual([
      { strategy: 'testId', value: 'login-button', fragile: false },
    ]);
  });

  it('skips an unmapped tag whose role is not button or link', () => {
    const { elements } = analyzeStaticSource({
      files: [file('src/App.tsx', '<div role="checkbox" aria-label="Accept terms"></div>')],
      clock: FIXED_CLOCK,
    });

    expect(elements).toEqual([]);
  });

  it('uses the system clock when none is given', () => {
    const { elements } = analyzeStaticSource({
      files: [file('src/App.tsx', '<button data-testid="submit"></button>')],
    });

    expect(elements[0]?.lastVerifiedAt).toEqual(expect.any(String));
    expect(new Date(elements[0]?.lastVerifiedAt ?? '').getTime()).not.toBeNaN();
  });

  it('stops scanning at an unclosed trailing tag instead of throwing, keeping earlier findings', () => {
    const { elements } = analyzeStaticSource({
      files: [file('src/App.tsx', '<button data-testid="submit"></button><div data-testid="broken"')],
      clock: FIXED_CLOCK,
    });

    expect(elements).toHaveLength(1);
    expect(elements[0]?.locatorCandidates).toEqual([{ strategy: 'testId', value: 'submit', fragile: false }]);
  });

  it('finds a testId past an inline arrow-function handler containing => (regression, #281)', () => {
    const { elements } = analyzeStaticSource({
      files: [
        file(
          'src/components/SaveButton.tsx',
          '<button onClick={() => save()} data-testid="save">Save</button>',
        ),
      ],
      clock: FIXED_CLOCK,
    });

    expect(elements[0]?.locatorCandidates).toEqual([{ strategy: 'testId', value: 'save', fragile: false }]);
  });

  it('finds a testId past a nested-brace handler containing multiple => (regression, #281)', () => {
    const { elements } = analyzeStaticSource({
      files: [
        file(
          'src/components/SaveButton.tsx',
          '<button onClick={() => { items.forEach((item) => save(item)); }} data-testid="save">Save</button>',
        ),
      ],
      clock: FIXED_CLOCK,
    });

    expect(elements[0]?.locatorCandidates).toEqual([{ strategy: 'testId', value: 'save', fragile: false }]);
  });

  it('finds a testId past a quoted attribute value containing an escaped quote', () => {
    const { elements } = analyzeStaticSource({
      files: [file('src/App.tsx', String.raw`<button title="a \" b" data-testid="save">Save</button>`)],
      clock: FIXED_CLOCK,
    });

    expect(elements[0]?.locatorCandidates).toEqual([{ strategy: 'testId', value: 'save', fragile: false }]);
  });

  it('finds a testId past a quoted attribute value containing a literal >', () => {
    const { elements } = analyzeStaticSource({
      files: [file('src/App.tsx', '<button title="a > b" data-testid="save">Save</button>')],
      clock: FIXED_CLOCK,
    });

    expect(elements[0]?.locatorCandidates).toEqual([{ strategy: 'testId', value: 'save', fragile: false }]);
  });

  it('returns no elements for a file with no recognizable tags', () => {
    const { elements } = analyzeStaticSource({
      files: [file('src/util.ts', 'export function add(a: number, b: number) { return a + b; }')],
      clock: FIXED_CLOCK,
    });

    expect(elements).toEqual([]);
  });
});
