// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { executedElementId, legacyExecutedElementId, pageKeyInEnvironment } from './element-id-page.js';
import type { EnvironmentScope } from './environment-scope.js';

const STAGING: EnvironmentScope = {
  name: 'staging',
  baseUrl: 'http://localhost:4200/',
  allowlist: ['localhost'],
};

describe('pageKeyInEnvironment', () => {
  it('names a page on the base origin by environment, path, query and fragment', () => {
    expect(pageKeyInEnvironment('http://localhost:4200/cart?tab=2#/items', STAGING)).toBe(
      'staging /cart?tab=2#/items',
    );
  });

  it('gives the same key when the same environment is served on another port', () => {
    const otherPort = { ...STAGING, baseUrl: 'http://localhost:4201/' };

    expect(pageKeyInEnvironment('http://localhost:4201/cart', otherPort)).toBe(
      pageKeyInEnvironment('http://localhost:4200/cart', STAGING),
    );
  });

  it('keeps the whole address of a page on another origin', () => {
    expect(pageKeyInEnvironment('http://localhost:8091/cart', STAGING)).toBe(
      'staging http://localhost:8091/cart',
    );
  });

  it('keeps the whole address when the page or the base URL cannot be parsed', () => {
    expect(pageKeyInEnvironment('not a url', STAGING)).toBe('staging not a url');
    expect(pageKeyInEnvironment('http://localhost:4200/cart', { ...STAGING, baseUrl: 'nope' })).toBe(
      'staging http://localhost:4200/cart',
    );
  });

  it('tells two environments with the same path apart', () => {
    const production = { ...STAGING, name: 'production' };

    expect(pageKeyInEnvironment('http://localhost:4200/cart', production)).not.toBe(
      pageKeyInEnvironment('http://localhost:4200/cart', STAGING),
    );
  });
});

describe('executedElementId', () => {
  it('is the same on another port, and differs from the id it had with the origin in it', () => {
    const otherPort = { ...STAGING, baseUrl: 'http://localhost:4201/' };

    expect(executedElementId('http://localhost:4201/cart', 'button', '#buy', otherPort)).toBe(
      executedElementId('http://localhost:4200/cart', 'button', '#buy', STAGING),
    );
    expect(executedElementId('http://localhost:4200/cart', 'button', '#buy', STAGING)).not.toBe(
      legacyExecutedElementId('http://localhost:4200/cart', 'button', '#buy'),
    );
  });
});
