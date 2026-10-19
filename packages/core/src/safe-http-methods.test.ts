// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { SAFE_HTTP_METHODS, isSafeHttpMethod } from './safe-http-methods.js';

describe('isSafeHttpMethod', () => {
  it.each(['GET', 'HEAD', 'OPTIONS', 'QUERY'])('treats %s as a read', (method) => {
    expect(isSafeHttpMethod(method)).toBe(true);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'TRACE', 'CONNECT', 'PROPFIND', ''])(
    'does not treat %j as a read',
    (method) => {
      expect(isSafeHttpMethod(method)).toBe(false);
    },
  );

  it.each(['get', 'Query', 'query', 'head'])('compares exactly, so %s is not a read', (method) => {
    expect(isSafeHttpMethod(method)).toBe(false);
  });

  it('lists the safe methods in a stable order for messages', () => {
    expect([...SAFE_HTTP_METHODS]).toEqual(['GET', 'HEAD', 'OPTIONS', 'QUERY']);
  });
});
