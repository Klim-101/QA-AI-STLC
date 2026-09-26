// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { isFlakyHistory } from './flaky-detection.js';

describe('isFlakyHistory', () => {
  it('flags a case whose status flips at least the configured number of times', () => {
    const history = ['passed', 'failed', 'passed', 'failed'] as const;
    expect(isFlakyHistory(history, { historyWindow: 10, minStatusChanges: 3 })).toBe(true);
  });

  it('does not flag a case with fewer status changes than configured', () => {
    const history = ['passed', 'failed', 'passed'] as const;
    expect(isFlakyHistory(history, { historyWindow: 10, minStatusChanges: 3 })).toBe(false);
  });

  it('does not flag a case that always fails, however consistently', () => {
    const history = ['failed', 'failed', 'failed', 'failed'] as const;
    expect(isFlakyHistory(history, { historyWindow: 10, minStatusChanges: 1 })).toBe(false);
  });

  it('does not flag a case with a single result', () => {
    expect(isFlakyHistory(['passed'], { historyWindow: 10, minStatusChanges: 1 })).toBe(false);
  });

  it('does not flag a case with no history', () => {
    expect(isFlakyHistory([], { historyWindow: 10, minStatusChanges: 1 })).toBe(false);
  });

  it('only inspects the configured history window, ignoring older flips', () => {
    // An old flip (passed -> failed) falls outside a window of 2, so only the last two
    // statuses (both "passed") are inspected and no flip is counted.
    const history = ['passed', 'failed', 'passed', 'passed'] as const;
    expect(isFlakyHistory(history, { historyWindow: 2, minStatusChanges: 1 })).toBe(false);
  });
});
