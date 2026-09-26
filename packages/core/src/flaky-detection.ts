// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { FlakyDetectionConfig, RunResultStatus } from '@qa-ai-stlc/schemas';

/**
 * Flags a case as flaky when its status flips back and forth within its most recent results,
 * rather than by a fixed pass-rate formula (development plan section 6): a case that always fails
 * is a real, consistent bug, not flaky, however low its pass rate. `statusHistory` must be in
 * chronological order, oldest first.
 */
export function isFlakyHistory(
  statusHistory: readonly RunResultStatus[],
  config: FlakyDetectionConfig,
): boolean {
  const window = statusHistory.slice(-config.historyWindow);
  let statusChanges = 0;
  for (let index = 1; index < window.length; index += 1) {
    if (window[index] !== window[index - 1]) {
      statusChanges += 1;
    }
  }
  return statusChanges >= config.minStatusChanges;
}
