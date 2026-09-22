// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Identifier } from '@qa-ai-stlc/schemas';

/**
 * The subset of a case's `testDataRefs` (P2-22) that does not resolve to a registered
 * `TestDataSchema` set's id. Empty means every ref resolves, including when the case declares no
 * `testDataRefs` at all — there is nothing to check, not a failure.
 */
export function findUnresolvedTestDataRefs(
  testDataRefs: readonly Identifier[] | undefined,
  knownTestDataIds: ReadonlySet<Identifier>,
): readonly Identifier[] {
  if (testDataRefs === undefined) {
    return [];
  }
  return testDataRefs.filter((id) => !knownTestDataIds.has(id));
}
