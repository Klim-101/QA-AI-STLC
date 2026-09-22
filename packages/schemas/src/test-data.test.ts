// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { TestDataSchema } from './test-data.js';

describe('TestDataSchema', () => {
  it('accepts a set with one or more non-empty values', () => {
    const result = TestDataSchema.safeParse({
      id: 'valid-checkout-card',
      feature: 'checkout',
      values: { cardNumber: '4111111111111111', expiry: '12/30', cvv: '123' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a set with no values at all', () => {
    const result = TestDataSchema.safeParse({
      id: 'empty-set',
      feature: 'checkout',
      values: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects a set with an empty-string value', () => {
    const result = TestDataSchema.safeParse({
      id: 'blank-value',
      feature: 'checkout',
      values: { cardNumber: '' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a feature that is not kebab-case', () => {
    const result = TestDataSchema.safeParse({
      id: 'bad-feature',
      feature: 'Checkout Flow',
      values: { cardNumber: '4111111111111111' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a set with no id', () => {
    const result = TestDataSchema.safeParse({
      feature: 'checkout',
      values: { cardNumber: '4111111111111111' },
    });
    expect(result.success).toBe(false);
  });
});
