// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { allowlistHostnames, parseAllowlistEntry } from './allowlist-entry.js';

describe('parseAllowlistEntry', () => {
  it('reads a bare host name', () => {
    expect(parseAllowlistEntry('staging.example.test')).toEqual({ hostname: 'staging.example.test' });
  });

  it('reads a host name with a port', () => {
    expect(parseAllowlistEntry('localhost:8091')).toEqual({ hostname: 'localhost', port: 8091 });
  });

  it.each(['localhost:', 'localhost:http', 'localhost:0', 'localhost:-1', 'localhost:80.5', ':8091x'])(
    'keeps %s whole as a host name that admits nothing',
    (entry) => {
      const parsed = parseAllowlistEntry(entry);

      expect(parsed.hostname).toBe(entry);
      expect(parsed.port).toBeUndefined();
    },
  );
});

describe('allowlistHostnames', () => {
  it('lists the host of every entry, with or without a port, in order', () => {
    expect(allowlistHostnames(['localhost', 'localhost:8091', 'api.example.test:8443'])).toEqual([
      'localhost',
      'localhost',
      'api.example.test',
    ]);
  });

  it('is empty for an empty allowlist', () => {
    expect(allowlistHostnames([])).toEqual([]);
  });
});
