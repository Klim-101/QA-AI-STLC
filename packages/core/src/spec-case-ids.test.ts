// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { extractSpecTestCaseIds } from './spec-case-ids.js';

describe('extractSpecTestCaseIds', () => {
  it('returns every distinct id in order, for either quote style', () => {
    const source = [
      "test('a', { annotation: { type: 'testCaseId', description: 'case-1' } }, async () => {});",
      'test("b", { annotation: { type: "testCaseId", description: "case-2" } }, async () => {});',
      "test('c', { annotation: { type: 'testCaseId', description: 'case-1' } }, async () => {});",
    ].join('\n');
    expect(extractSpecTestCaseIds(source)).toEqual(['case-1', 'case-2']);
  });

  it('returns nothing when the spec declares no annotation', () => {
    expect(extractSpecTestCaseIds("test('a', async () => {});")).toEqual([]);
  });
});
