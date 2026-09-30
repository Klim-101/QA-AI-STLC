// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Matches Playwright's `test(title, { annotation: { type: 'testCaseId', description: '<id>' } },
// ...)` convention (runner-playwright's map-result.ts, the only place a run result's testCaseId is
// ever read from), so anything that needs to know which case a spec exercises reads it the same
// way a run result will later report it.
const TEST_CASE_ID_ANNOTATION = /type:\s*(['"])testCaseId\1\s*,\s*description:\s*(['"])([^'"]+)\2/gu;

/** The distinct test case ids a spec's source declares through `testCaseId` annotations, in order. */
export function extractSpecTestCaseIds(specSource: string): string[] {
  const ids = new Set<string>();
  for (const match of specSource.matchAll(TEST_CASE_ID_ANNOTATION)) {
    // Group 3 is not optional in the pattern, so every match has it.
    // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
    ids.add(match[3] as string);
  }
  return [...ids];
}
