// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { findUnresolvedTestDataRefs } from './test-data-linking.js';

describe('findUnresolvedTestDataRefs', () => {
  it('returns an empty list when testDataRefs is undefined', () => {
    expect(findUnresolvedTestDataRefs(undefined, new Set(['valid-card']))).toEqual([]);
  });

  it('returns an empty list when every ref resolves', () => {
    expect(findUnresolvedTestDataRefs(['valid-card'], new Set(['valid-card', 'other']))).toEqual([]);
  });

  it('returns the refs that do not resolve to a known test-data id', () => {
    expect(findUnresolvedTestDataRefs(['valid-card', 'missing'], new Set(['valid-card']))).toEqual([
      'missing',
    ]);
  });
});
