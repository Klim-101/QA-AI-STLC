// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Identifier, Scope } from '@qa-ai-stlc/schemas';

/**
 * The subset of `requirementIds` that does not resolve to a requirement in `scope` (development
 * plan section 2.7 step 9, P2-03: the requirement → case → result → evidence traceability
 * matrix). Empty means every id links to a real requirement. A missing scope (no `qa scope` run
 * yet) has zero known requirements, so every id comes back unlinked — correct, not a crash: there
 * is nothing yet for a case to trace to.
 */
export function findUnlinkedRequirementIds(
  requirementIds: readonly Identifier[],
  scope: Scope,
): readonly Identifier[] {
  const knownIds = new Set(scope.requirements.map((requirement) => requirement.id));
  return requirementIds.filter((id) => !knownIds.has(id));
}
