// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { assertUrlAllowed, isUrlAllowed } from './browser-allowlist.js';

const ALLOWLIST = ['staging.example.test'];
const BASE_URL = 'https://staging.example.test/';

describe('isUrlAllowed', () => {
  it('accepts a URL whose hostname, scheme and port all match', () => {
    expect(isUrlAllowed('https://staging.example.test/login?next=/home', ALLOWLIST, BASE_URL)).toBe(true);
  });

  it('accepts a URL that spells out the scheme default port explicitly', () => {
    expect(isUrlAllowed('https://staging.example.test:443/', ALLOWLIST, BASE_URL)).toBe(true);
  });

  it('rejects another host, including a subdomain of an allowed one', () => {
    expect(isUrlAllowed('https://evil.test/', ALLOWLIST, BASE_URL)).toBe(false);
    expect(isUrlAllowed('https://admin.staging.example.test/', ALLOWLIST, BASE_URL)).toBe(false);
  });

  it('rejects a value that is not an absolute URL', () => {
    expect(isUrlAllowed('/login', ALLOWLIST, BASE_URL)).toBe(false);
  });

  it('rejects an allowlisted hostname on the wrong scheme (regression, #306)', () => {
    expect(isUrlAllowed('http://staging.example.test/', ALLOWLIST, BASE_URL)).toBe(false);
  });

  it('rejects an allowlisted hostname on a non-default port baseUrl never specified (regression, #306)', () => {
    expect(isUrlAllowed('http://staging.example.test:9999/', ALLOWLIST, BASE_URL)).toBe(false);
  });

  it('rejects an allowlisted hostname on the right scheme but a mismatched explicit port', () => {
    const baseUrlWithPort = 'https://staging.example.test:8443/';
    expect(isUrlAllowed('https://staging.example.test/', ALLOWLIST, baseUrlWithPort)).toBe(false);
    expect(isUrlAllowed('https://staging.example.test:8443/', ALLOWLIST, baseUrlWithPort)).toBe(true);
  });

  it('rejects everything when baseUrl itself is not an absolute URL', () => {
    expect(isUrlAllowed('https://staging.example.test/', ALLOWLIST, 'not-a-url')).toBe(false);
  });

  it('accepts an http baseUrl on its own default port (80)', () => {
    const httpBaseUrl = 'http://staging.example.test/';
    expect(isUrlAllowed('http://staging.example.test/', ALLOWLIST, httpBaseUrl)).toBe(true);
    expect(isUrlAllowed('http://staging.example.test:9999/', ALLOWLIST, httpBaseUrl)).toBe(false);
  });
});

describe('assertUrlAllowed', () => {
  it('returns quietly for an allowed URL', () => {
    expect(() => {
      assertUrlAllowed('https://staging.example.test/', ALLOWLIST, BASE_URL);
    }).not.toThrow();
  });

  it('throws BROWSER_URL_INVALID for a relative URL', () => {
    expect(() => {
      assertUrlAllowed('/login', ALLOWLIST, BASE_URL);
    }).toThrow(expect.objectContaining({ code: 'BROWSER_URL_INVALID' }) as Error);
  });

  it('throws BROWSER_BASE_URL_INVALID when the environment baseUrl itself is malformed', () => {
    expect(() => {
      assertUrlAllowed('https://staging.example.test/', ALLOWLIST, 'not-a-url');
    }).toThrow(expect.objectContaining({ code: 'BROWSER_BASE_URL_INVALID' }) as Error);
  });

  it('throws BROWSER_URL_NOT_ALLOWED naming the allowed hosts', () => {
    try {
      assertUrlAllowed('https://evil.test/', ALLOWLIST, BASE_URL);
      expect.unreachable('expected an off-allowlist URL to throw');
    } catch (error) {
      expect(error).toMatchObject({ code: 'BROWSER_URL_NOT_ALLOWED' });
      expect((error as { remediation?: string }).remediation).toContain('staging.example.test');
    }
  });

  it('throws BROWSER_URL_NOT_ALLOWED for an allowlisted host on the wrong scheme or port (regression, #306)', () => {
    expect(() => {
      assertUrlAllowed('http://staging.example.test:9999/', ALLOWLIST, BASE_URL);
    }).toThrow(expect.objectContaining({ code: 'BROWSER_URL_NOT_ALLOWED' }) as Error);
  });

  it('throws BROWSER_URL_NOT_ALLOWED for a port mismatch against an http baseUrl on its default port', () => {
    expect(() => {
      assertUrlAllowed('http://staging.example.test:9999/', ALLOWLIST, 'http://staging.example.test/');
    }).toThrow(expect.objectContaining({ code: 'BROWSER_URL_NOT_ALLOWED' }) as Error);
  });

  it('names the expected port in its message when baseUrl uses a non-default one', () => {
    try {
      assertUrlAllowed('https://staging.example.test/', ALLOWLIST, 'https://staging.example.test:8443/');
      expect.unreachable('expected a port mismatch to throw');
    } catch (error) {
      expect((error as Error).message).toContain('staging.example.test:8443');
    }
  });
});
