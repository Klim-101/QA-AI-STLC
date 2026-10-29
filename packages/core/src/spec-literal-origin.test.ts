// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { findLiteralOrigin } from './spec-literal-origin.js';

describe('findLiteralOrigin', () => {
  it('finds the origin inside a location assertion', () => {
    const content = 'await expect(page).toHaveURL(new RegExp("http://localhost:4310/tasks"));';

    expect(findLiteralOrigin(content, 'http://localhost:4310/login')).toBe('http://localhost:4310');
  });

  it('finds it whatever the letter case and when the spec ends right after it', () => {
    expect(findLiteralOrigin("goto('HTTP://LOCALHOST:4310')", 'http://localhost:4310')).toBe(
      'http://localhost:4310',
    );
  });

  it('does not report a spec that asserts a path', () => {
    const content = 'await expect(page).toHaveURL(/\\/tasks$/);';

    expect(findLiteralOrigin(content, 'http://localhost:4310')).toBeUndefined();
  });

  it('does not report another origin that only starts like the configured one', () => {
    const base = 'http://localhost:4310';

    expect(findLiteralOrigin('http://localhost:43100/tasks', base)).toBeUndefined();
    expect(
      findLiteralOrigin('http://staging.example.com.evil/x', 'http://staging.example.com'),
    ).toBeUndefined();
    expect(findLiteralOrigin('http://localhost:4310-x', base)).toBeUndefined();
  });

  it('reports the default-port origin and not a different port of the same host', () => {
    expect(findLiteralOrigin('https://app.example.com/x', 'https://app.example.com:443/login')).toBe(
      'https://app.example.com',
    );
    expect(findLiteralOrigin('https://app.example.com:8443/x', 'https://app.example.com')).toBeUndefined();
  });

  it('escapes the origin, so a dot in a host is not a wildcard', () => {
    expect(findLiteralOrigin('https://appXexample.com/x', 'https://app.example.com')).toBeUndefined();
  });

  it('reports an origin followed by a sentence dot', () => {
    expect(findLiteralOrigin('// see http://localhost:4310.', 'http://localhost:4310')).toBe(
      'http://localhost:4310',
    );
  });
});
