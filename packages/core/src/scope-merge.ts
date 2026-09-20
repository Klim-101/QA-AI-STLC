// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Requirement } from '@qa-ai-stlc/schemas';

export interface MergeRequirementsResult {
  readonly requirements: readonly Requirement[];
  readonly added: number;
  readonly updated: number;
}

/**
 * Upserts `incoming` into `existing` by `id`: an id already present is replaced in place (the
 * newer extraction wins, matching the "keep the most recently supplied requirement" reading of
 * requirements source priority — development plan section 4), a new id is appended in extraction
 * order. `existing`'s own order for untouched requirements is preserved, so a repeated `qa scope`
 * call does not reshuffle a file the operator may have hand-edited `inScope` on.
 */
export function mergeRequirements(
  existing: readonly Requirement[],
  incoming: readonly Requirement[],
): MergeRequirementsResult {
  const incomingById = new Map(incoming.map((requirement) => [requirement.id, requirement]));
  const existingIds = new Set(existing.map((requirement) => requirement.id));

  const merged = existing.map((requirement) => incomingById.get(requirement.id) ?? requirement);
  const newOnes = incoming.filter((requirement) => !existingIds.has(requirement.id));

  return {
    requirements: [...merged, ...newOnes],
    added: newOnes.length,
    updated: incoming.length - newOnes.length,
  };
}
