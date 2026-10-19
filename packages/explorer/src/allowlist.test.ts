// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { isAllowedUrl, normalizeUrl } from './allowlist.js';

describe('isAllowedUrl', () => {
  it('accepts a URL whose hostname is on the allowlist', () => {
    expect(isAllowedUrl('https://staging.example.com/tasks', ['staging.example.com'])).toBe(true);
  });

  it('rejects a URL whose hostname is not on the allowlist', () => {
    expect(isAllowedUrl('https://evil.example.com/tasks', ['staging.example.com'])).toBe(false);
  });

  it('rejects a value that is not a valid URL', () => {
    expect(isAllowedUrl('not a url', ['staging.example.com'])).toBe(false);
  });

  it('names hosts, not ports: an entry with a port still admits its host (ADR-0019)', () => {
    expect(isAllowedUrl('http://localhost:4200/home', ['localhost', 'localhost:8091'])).toBe(true);
    expect(isAllowedUrl('http://api.example.com:8443/', ['app.example.com', 'api.example.com:8443'])).toBe(
      true,
    );
    expect(isAllowedUrl('http://evil.example.com:8443/', ['app.example.com', 'api.example.com:8443'])).toBe(
      false,
    );
  });
});

describe('normalizeUrl', () => {
  it('drops the fragment', () => {
    expect(normalizeUrl('https://staging.example.com/tasks#details')).toBe(
      'https://staging.example.com/tasks',
    );
  });

  it('leaves a URL without a fragment unchanged', () => {
    expect(normalizeUrl('https://staging.example.com/tasks')).toBe('https://staging.example.com/tasks');
  });
});
