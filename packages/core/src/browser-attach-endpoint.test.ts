// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { assertLoopbackCdpEndpoint } from './browser-attach-endpoint.js';

describe('assertLoopbackCdpEndpoint', () => {
  it.each([
    'http://127.0.0.1:9222',
    'http://localhost:9222',
    'http://127.8.9.10:9222',
    'http://[::1]:9222',
    'https://localhost:9222',
    'ws://127.0.0.1:9222/devtools/browser/0a1b2c',
    'wss://localhost:9222/devtools/browser/0a1b2c',
  ])('accepts %s and returns it unchanged', (endpoint) => {
    expect(assertLoopbackCdpEndpoint(endpoint)).toBe(endpoint);
  });

  it.each([
    'http://example.test:9222',
    'http://10.0.0.5:9222',
    'http://192.168.1.20:9222',
    'http://0.0.0.0:9222',
    'http://localhost.example.test:9222',
    'http://127.0.0.1.example.test:9222',
    'http://[2001:db8::1]:9222',
    'http://[::ffff:10.0.0.5]:9222',
  ])('refuses %s as not on this machine', (endpoint) => {
    expect(() => assertLoopbackCdpEndpoint(endpoint)).toThrow(
      expect.objectContaining({ code: 'BROWSER_ATTACH_ENDPOINT_NOT_LOOPBACK' }) as Error,
    );
  });

  it('refuses text that is not a URL, keeping the parse error as the cause', () => {
    try {
      assertLoopbackCdpEndpoint('not a url');
      expect.unreachable('expected a malformed endpoint to throw');
    } catch (error) {
      expect(error).toMatchObject({ code: 'BROWSER_ATTACH_ENDPOINT_INVALID' });
      expect((error as Error).cause).toBeInstanceOf(Error);
    }
  });

  it.each([
    'ftp://127.0.0.1:9222',
    'file:///tmp/x',
    'http://user:secret@127.0.0.1:9222',
    'http://:secret@127.0.0.1:9222',
  ])('refuses %s', (endpoint) => {
    expect(() => assertLoopbackCdpEndpoint(endpoint)).toThrow(
      expect.objectContaining({ code: 'BROWSER_ATTACH_ENDPOINT_INVALID' }) as Error,
    );
  });
});
