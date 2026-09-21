// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { assertUrlAllowed, isUrlAllowed } from './browser-allowlist.js';

const ALLOWLIST = ['staging.example.test'];

describe('isUrlAllowed', () => {
  it('accepts a URL whose hostname is on the allowlist', () => {
    expect(isUrlAllowed('https://staging.example.test/login?next=/home', ALLOWLIST)).toBe(true);
  });

  it('rejects another host, including a subdomain of an allowed one', () => {
    expect(isUrlAllowed('https://evil.test/', ALLOWLIST)).toBe(false);
    expect(isUrlAllowed('https://admin.staging.example.test/', ALLOWLIST)).toBe(false);
  });

  it('rejects a value that is not an absolute URL', () => {
    expect(isUrlAllowed('/login', ALLOWLIST)).toBe(false);
  });
});

describe('assertUrlAllowed', () => {
  it('returns quietly for an allowed URL', () => {
    expect(() => {
      assertUrlAllowed('https://staging.example.test/', ALLOWLIST);
    }).not.toThrow();
  });

  it('throws BROWSER_URL_INVALID for a relative URL', () => {
    expect(() => {
      assertUrlAllowed('/login', ALLOWLIST);
    }).toThrow(expect.objectContaining({ code: 'BROWSER_URL_INVALID' }) as Error);
  });

  it('throws BROWSER_URL_NOT_ALLOWED naming the allowed hosts', () => {
    try {
      assertUrlAllowed('https://evil.test/', ALLOWLIST);
      expect.unreachable('expected an off-allowlist URL to throw');
    } catch (error) {
      expect(error).toMatchObject({ code: 'BROWSER_URL_NOT_ALLOWED' });
      expect((error as { remediation?: string }).remediation).toContain('staging.example.test');
    }
  });
});
