// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { createSequentialIdGenerator } from './fake-id-generator.js';

describe('createSequentialIdGenerator', () => {
  it('counts up from one, prefixed', () => {
    const ids = createSequentialIdGenerator('id');

    expect([ids.next(), ids.next(), ids.next()]).toEqual(['id-1', 'id-2', 'id-3']);
  });
});
