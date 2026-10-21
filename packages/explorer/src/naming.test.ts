// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { createElementNamer, toCamelCaseIdentifier, toLocatorFunctionName } from './naming.js';

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

  it.each([
    ['Iniciar sesión', 'iniciarSesion'],
    ['Categorías', 'categorias'],
    ['Herramientas eléctricas', 'herramientasElectricas'],
    ['Crème brûlée', 'cremeBrulee'],
    ['Вход в систему', 'входВСистему'],
    ['Край', 'край'],
    ['ログイン', 'ログイン'],
  ])('keeps the letters of %j', (text, expected) => {
    expect(toCamelCaseIdentifier(text, 'button')).toBe(expected);
  });

  it('drops a combining mark that starts a word', () => {
    expect(toCamelCaseIdentifier('́abc', 'button')).toBe('abc');
  });

  it('prefixes a name that starts with a non-ASCII digit', () => {
    expect(toCamelCaseIdentifier('٣ items', 'link')).toBe('element٣Items');
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

describe('toLocatorFunctionName', () => {
  it('keeps a name that is already an identifier', () => {
    expect(toLocatorFunctionName('loginButton', 'button')).toBe('loginButton');
  });

  it('keeps a registered name written in another script', () => {
    expect(toLocatorFunctionName('кнопкаВход', 'button')).toBe('кнопкаВход');
  });

  it.each([
    ['Last GW ID', 'lastGwId'],
    ['1st', 'element1st'],
    ['delete', 'deleteElement'],
    ['→', 'button'],
  ])('derives an identifier from %j', (label, expected) => {
    expect(toLocatorFunctionName(label, 'button')).toBe(expected);
  });
});
