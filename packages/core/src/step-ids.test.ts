// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { canonicalStepIds } from './step-ids.js';

describe('canonicalStepIds', () => {
  it('numbers each step in declaration order and appends the fixed expected-result id', () => {
    const ids = canonicalStepIds({
      steps: [{ description: 'Fill in the form' }, { description: 'Submit' }, { description: 'Confirm' }],
    });

    expect(ids).toEqual(['step-1', 'step-2', 'step-3', 'expected-result']);
  });

  it('returns just the expected-result id for a case with a single step', () => {
    const ids = canonicalStepIds({ steps: [{ description: 'Do the one thing' }] });

    expect(ids).toEqual(['step-1', 'expected-result']);
  });
});
