// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Requirement } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { findOrphanedRequirementIds, mergeRequirements } from './scope-merge.js';

const SOURCE = { kind: 'file' as const, path: 'docs/requirements.md' };

function requirement(overrides: Partial<Requirement> = {}): Requirement {
  return { id: 'r1', title: 'Requirement', source: SOURCE, inScope: true, ...overrides };
}

describe('mergeRequirements', () => {
  it('appends a requirement whose id is new', () => {
    const result = mergeRequirements([], [requirement()]);

    expect(result.requirements).toEqual([requirement()]);
    expect(result.added).toBe(1);
    expect(result.updated).toBe(0);
  });

  it('replaces an existing requirement with the same id, keeping its position', () => {
    const existing = [requirement({ id: 'r1', title: 'Old' }), requirement({ id: 'r2', title: 'Other' })];
    const incoming = [requirement({ id: 'r1', title: 'New' })];

    const result = mergeRequirements(existing, incoming);

    expect(result.requirements.map((r) => r.title)).toEqual(['New', 'Other']);
    expect(result.added).toBe(0);
    expect(result.updated).toBe(1);
  });

  it('appends new requirements after existing ones, in incoming order', () => {
    const existing = [requirement({ id: 'r1' })];
    const incoming = [requirement({ id: 'r2' }), requirement({ id: 'r3' })];

    const result = mergeRequirements(existing, incoming);

    expect(result.requirements.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    expect(result.added).toBe(2);
  });

  it('leaves requirements not touched by incoming untouched, including a hand-edited inScope', () => {
    const existing = [requirement({ id: 'r1', inScope: false })];

    const result = mergeRequirements(existing, []);

    expect(result.requirements).toEqual([requirement({ id: 'r1', inScope: false })]);
  });

  it('returns an empty result for two empty inputs', () => {
    expect(mergeRequirements([], [])).toEqual({ requirements: [], added: 0, updated: 0 });
  });
});

describe('mergeRequirements and the operator scope decision', () => {
  it('keeps an out-of-scope decision when the same requirement is extracted again', () => {
    const existing = [requirement({ id: 'r1', title: 'Old', inScope: false })];
    const incoming = [requirement({ id: 'r1', title: 'New', inScope: true })];

    const result = mergeRequirements(existing, incoming);

    expect(result.requirements).toEqual([requirement({ id: 'r1', title: 'New', inScope: false })]);
  });
});

describe('findOrphanedRequirementIds', () => {
  const textSource = { kind: 'text' as const, label: 'operator input' };

  it('reports a requirement of this source whose section is gone, in existing order', () => {
    const existing = [requirement({ id: 'r1' }), requirement({ id: 'r2' }), requirement({ id: 'r3' })];

    expect(findOrphanedRequirementIds(existing, [requirement({ id: 'r2' })], SOURCE)).toEqual(['r1', 'r3']);
  });

  it('reports nothing when every requirement is still extracted', () => {
    expect(findOrphanedRequirementIds([requirement()], [requirement()], SOURCE)).toEqual([]);
  });

  it('does not report a requirement already taken out of scope', () => {
    const existing = [requirement({ id: 'r1', inScope: false })];

    expect(findOrphanedRequirementIds(existing, [], SOURCE)).toEqual([]);
  });

  it('does not judge a requirement of another file by this file', () => {
    const existing = [requirement({ id: 'r1', source: { kind: 'file', path: 'docs/other.md' } })];

    expect(findOrphanedRequirementIds(existing, [], SOURCE)).toEqual([]);
  });

  it('does not judge a text requirement by a file, nor a file requirement by text', () => {
    const fromText = requirement({ id: 'r1', source: textSource });
    const fromFile = requirement({ id: 'r2' });

    expect(findOrphanedRequirementIds([fromText], [], SOURCE)).toEqual([]);
    expect(findOrphanedRequirementIds([fromFile], [], textSource)).toEqual([]);
  });

  it('matches a text source by its label', () => {
    const existing = [
      requirement({ id: 'r1', source: textSource }),
      requirement({ id: 'r2', source: { kind: 'text', label: 'another label' } }),
    ];

    expect(findOrphanedRequirementIds(existing, [], textSource)).toEqual(['r1']);
  });
});
