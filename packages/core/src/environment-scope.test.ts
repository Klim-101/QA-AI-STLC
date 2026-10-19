// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  isInEnvironment,
  partitionByEnvironment,
  scopeOfEnvironment,
  withEnvironment,
  type EnvironmentScope,
} from './environment-scope.js';

const LOCAL: EnvironmentScope = scopeOfEnvironment('local', {
  baseUrl: 'http://localhost:4200',
  allowlist: ['localhost', 'localhost:8091'],
});
const PUBLIC: EnvironmentScope = scopeOfEnvironment('public', {
  baseUrl: 'https://shop.example.test',
  allowlist: ['shop.example.test', 'api.example.test'],
});

describe('scopeOfEnvironment', () => {
  it('keeps the name and the rules that admit an address', () => {
    expect(LOCAL).toEqual({
      name: 'local',
      baseUrl: 'http://localhost:4200',
      allowlist: ['localhost', 'localhost:8091'],
    });
  });
});

describe('isInEnvironment', () => {
  it('belongs to the environment it names, whatever its page says', () => {
    expect(isInEnvironment({ environment: 'local', pageUrl: 'https://shop.example.test/' }, LOCAL)).toBe(
      true,
    );
  });

  it('does not belong to another environment it does not name, even on an address that environment admits', () => {
    expect(isInEnvironment({ environment: 'public', pageUrl: 'http://localhost:4200/' }, LOCAL)).toBe(false);
  });

  it('is claimed by the environment whose address rules admit its page, when it names none', () => {
    expect(isInEnvironment({ pageUrl: 'http://localhost:4200/login' }, LOCAL)).toBe(true);
    expect(isInEnvironment({ pageUrl: 'http://localhost:4200/login' }, PUBLIC)).toBe(false);
  });

  it('is not claimed by an environment that admits its host on another port', () => {
    expect(isInEnvironment({ pageUrl: 'http://localhost:9999/' }, LOCAL)).toBe(false);
  });

  it('belongs to every environment when it names none and has no page', () => {
    expect(isInEnvironment({}, LOCAL)).toBe(true);
    expect(isInEnvironment({}, PUBLIC)).toBe(true);
  });
});

describe('partitionByEnvironment', () => {
  it('splits items into the ones of the scope and the rest, keeping their order', () => {
    const items = [
      { id: 1, pageUrl: 'http://localhost:4200/a' },
      { id: 2, pageUrl: 'https://shop.example.test/b' },
      { id: 3, environment: 'local' },
      { id: 4 },
      { id: 5, environment: 'public', pageUrl: 'http://localhost:4200/c' },
    ];

    const { inScope, outOfScope } = partitionByEnvironment(items, LOCAL);

    expect(inScope.map((item) => item.id)).toEqual([1, 3, 4]);
    expect(outOfScope.map((item) => item.id)).toEqual([2, 5]);
  });

  it('is empty on both sides for no items', () => {
    expect(partitionByEnvironment([], LOCAL)).toEqual({ inScope: [], outOfScope: [] });
  });
});

describe('withEnvironment', () => {
  it('records the environment on an element that has a page and names none', () => {
    expect(withEnvironment({ id: 1, pageUrl: 'http://localhost:4200/a' }, LOCAL)).toEqual({
      id: 1,
      pageUrl: 'http://localhost:4200/a',
      environment: 'local',
    });
  });

  it('leaves an element that already names an environment as it is', () => {
    const element = { id: 1, pageUrl: 'http://localhost:4200/a', environment: 'public' };

    expect(withEnvironment(element, LOCAL)).toBe(element);
  });

  it('leaves an element with no page as it is: it belongs to no environment in particular', () => {
    const element: { id: number; pageUrl?: string } = { id: 1 };

    expect(withEnvironment(element, LOCAL)).toBe(element);
  });
});
