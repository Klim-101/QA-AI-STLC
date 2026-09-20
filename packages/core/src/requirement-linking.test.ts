// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Requirement, Scope } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { findUnlinkedRequirementIds } from './requirement-linking.js';

function requirement(id: string): Requirement {
  return { id, title: id, source: { kind: 'text', label: 'test' }, inScope: true };
}

function scope(requirements: readonly Requirement[]): Scope {
  return { schemaVersion: 1, generatedAt: '2026-09-20T12:00:00Z', requirements: [...requirements] };
}

describe('findUnlinkedRequirementIds', () => {
  it('returns an empty array when every id resolves', () => {
    const result = findUnlinkedRequirementIds(['r1', 'r2'], scope([requirement('r1'), requirement('r2')]));

    expect(result).toEqual([]);
  });

  it('returns the ids that do not resolve', () => {
    const result = findUnlinkedRequirementIds(['r1', 'r2'], scope([requirement('r1')]));

    expect(result).toEqual(['r2']);
  });

  it('treats every id as unlinked when the scope has no requirements', () => {
    const result = findUnlinkedRequirementIds(['r1'], scope([]));

    expect(result).toEqual(['r1']);
  });

  it('returns an empty array for a case with no ids to check', () => {
    expect(findUnlinkedRequirementIds([], scope([requirement('r1')]))).toEqual([]);
  });
});
