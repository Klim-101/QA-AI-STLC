// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Identifier, Requirement, RequirementSource } from '@qa-ai-stlc/schemas';

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
 * call does not reshuffle the file. The operator's `inScope` decision (`qa scope set`) is not part
 * of the source text, so an update keeps it instead of resetting it to the extractor's default.
 */
export function mergeRequirements(
  existing: readonly Requirement[],
  incoming: readonly Requirement[],
): MergeRequirementsResult {
  const incomingById = new Map(incoming.map((requirement) => [requirement.id, requirement]));
  const existingIds = new Set(existing.map((requirement) => requirement.id));

  const merged = existing.map((requirement) => {
    const replacement = incomingById.get(requirement.id);
    return replacement === undefined ? requirement : { ...replacement, inScope: requirement.inScope };
  });
  const newOnes = incoming.filter((requirement) => !existingIds.has(requirement.id));

  return {
    requirements: [...merged, ...newOnes],
    added: newOnes.length,
    updated: incoming.length - newOnes.length,
  };
}

function isSameSource(left: RequirementSource, right: RequirementSource): boolean {
  if (left.kind === 'file') {
    return right.kind === 'file' && left.path === right.path;
  }
  return right.kind === 'text' && left.label === right.label;
}

/**
 * The ids of requirements still in scope that came from `source` but are not in `incoming`: the
 * operator removed their section from that source, so they would otherwise stay in the approved
 * scope with nothing behind them. A requirement already taken out of scope is not reported, and
 * one from another source is never judged by this one.
 */
export function findOrphanedRequirementIds(
  existing: readonly Requirement[],
  incoming: readonly Requirement[],
  source: RequirementSource,
): Identifier[] {
  const incomingIds = new Set(incoming.map((requirement) => requirement.id));
  return existing
    .filter(
      (requirement) =>
        requirement.inScope && isSameSource(requirement.source, source) && !incomingIds.has(requirement.id),
    )
    .map((requirement) => requirement.id);
}
