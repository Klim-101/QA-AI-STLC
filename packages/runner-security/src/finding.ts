// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { SecurityFinding } from '@qa-ai-stlc/schemas';

/** A finding id is part of a draft's id and file name, so it is reduced to a plain slug. */
export function findingId(...parts: readonly string[]): string {
  return parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

export type FindingInput = Omit<SecurityFinding, 'id'> & { readonly idParts: readonly string[] };

export function buildFinding({ idParts, ...rest }: FindingInput): SecurityFinding {
  return { id: findingId(...idParts), ...rest };
}
