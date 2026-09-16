// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashText } from './hash.js';

describe('hashText', () => {
  it('matches a plain SHA-256 hex digest of the content', () => {
    const content = 'hello world';
    expect(hashText(content)).toBe(createHash('sha256').update(content, 'utf-8').digest('hex'));
  });

  it('produces the same hash for CRLF and LF line endings', () => {
    expect(hashText('line one\r\nline two\r\n')).toBe(hashText('line one\nline two\n'));
  });

  it('produces a lowercase 64-character hex digest', () => {
    expect(hashText('anything')).toMatch(/^[0-9a-f]{64}$/);
  });
});
