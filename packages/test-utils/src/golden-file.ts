// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { expect } from 'vitest';

/**
 * Asserts that `actual` matches the golden file at `goldenFilePath` (resolved relative to the
 * calling test file). Line endings are normalized before comparison so the same golden file
 * passes on Windows and POSIX checkouts. Update golden files intentionally with
 * `npm run test -- -u` and review the diff (AGENTS.md section 13).
 */
export async function expectMatchesGoldenFile(actual: string, goldenFilePath: string): Promise<void> {
  const normalized = actual.replace(/\r\n/g, '\n');
  await expect(normalized).toMatchFileSnapshot(goldenFilePath);
}
