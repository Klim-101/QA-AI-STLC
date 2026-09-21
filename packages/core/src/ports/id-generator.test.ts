// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { randomIdGenerator } from './id-generator.js';

describe('randomIdGenerator', () => {
  it('returns a different identifier on every call', () => {
    const first = randomIdGenerator.next();
    const second = randomIdGenerator.next();

    expect(first).not.toEqual(second);
    expect(first.length).toBeGreaterThan(0);
  });
});
