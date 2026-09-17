// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { capArray, truncateText } from './normalize.js';

describe('truncateText', () => {
  it('leaves text within the limit unchanged', () => {
    expect(truncateText('short', { maxTextLength: 10, maxArrayLength: 10, maxTreeNodes: 10 })).toEqual({
      text: 'short',
      truncated: false,
    });
  });

  it('truncates text over the limit and marks it', () => {
    expect(
      truncateText('a very long piece of text', { maxTextLength: 5, maxArrayLength: 10, maxTreeNodes: 10 }),
    ).toEqual({
      text: 'a ver…',
      truncated: true,
    });
  });
});

describe('capArray', () => {
  it('leaves an array within the limit unchanged', () => {
    expect(capArray([1, 2], { maxTextLength: 10, maxArrayLength: 5, maxTreeNodes: 10 })).toEqual({
      items: [1, 2],
      truncated: false,
    });
  });

  it('caps an array over the limit and marks it', () => {
    expect(capArray([1, 2, 3, 4], { maxTextLength: 10, maxArrayLength: 2, maxTreeNodes: 10 })).toEqual({
      items: [1, 2],
      truncated: true,
    });
  });
});
