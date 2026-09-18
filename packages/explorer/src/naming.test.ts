// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { createElementNamer, toCamelCaseIdentifier } from './naming.js';

describe('toCamelCaseIdentifier', () => {
  it('camelCases multi-word text', () => {
    expect(toCamelCaseIdentifier('Log in', 'button')).toBe('logIn');
  });

  it('falls back to the fallback word when the text has no letters or digits', () => {
    expect(toCamelCaseIdentifier('→', 'button')).toBe('button');
  });

  it('prefixes an identifier that would start with a digit with "element"', () => {
    expect(toCamelCaseIdentifier('2fa code', 'input')).toBe('element2faCode');
  });

  it('never returns a bare reserved word', () => {
    expect(toCamelCaseIdentifier('Delete', 'link')).toBe('deleteElement');
  });
});

describe('createElementNamer', () => {
  it('returns distinct names for distinct base text', () => {
    const nameFor = createElementNamer();

    expect(nameFor('Log in', 'button')).toBe('logIn');
    expect(nameFor('Cancel', 'button')).toBe('cancel');
  });

  it('suffixes a second element resolving to the same base name', () => {
    const nameFor = createElementNamer();

    expect(nameFor('Submit', 'button')).toBe('submit');
    expect(nameFor('Submit', 'button')).toBe('submit2');
    expect(nameFor('Submit', 'button')).toBe('submit3');
  });

  it('tracks collisions independently across two separate namers', () => {
    const first = createElementNamer();
    const second = createElementNamer();

    expect(first('Submit', 'button')).toBe('submit');
    expect(second('Submit', 'button')).toBe('submit');
  });
});
