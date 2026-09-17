// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashBytes, hashContent, hashText } from './hash.js';

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

describe('hashBytes', () => {
  it('matches a plain SHA-256 hex digest of the raw bytes', () => {
    const content = new Uint8Array([0, 1, 2, 3, 255]);
    expect(hashBytes(content)).toBe(createHash('sha256').update(content).digest('hex'));
  });

  it('does not normalize CRLF bytes the way hashText does', () => {
    const crlf = new TextEncoder().encode('line one\r\nline two\r\n');
    const lf = new TextEncoder().encode('line one\nline two\n');
    expect(hashBytes(crlf)).not.toBe(hashBytes(lf));
  });
});

describe('hashContent', () => {
  it('dispatches strings to hashText', () => {
    expect(hashContent('hello')).toBe(hashText('hello'));
  });

  it('dispatches Uint8Array to hashBytes', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(hashContent(bytes)).toBe(hashBytes(bytes));
  });
});
