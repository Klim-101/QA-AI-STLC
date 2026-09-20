// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Requirement } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { mergeRequirements } from './scope-merge.js';

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
