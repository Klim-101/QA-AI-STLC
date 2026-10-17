// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { TriageEntrySchema, TriageInputSchema, TriageSchema } from './triage.js';

const ENTRY = {
  resultId: 'r1',
  testCaseId: 'login',
  category: 'product-bug',
  confidence: 'high',
  reasons: ['The dashboard never loads.'],
};

describe('TriageSchema', () => {
  it('accepts a triage and defaults the schema version and the evidence of an entry', () => {
    const triage = TriageSchema.parse({
      runId: 'run-1',
      entries: [ENTRY],
      createdAt: '2026-10-17T09:00:00Z',
    });

    expect(triage.schemaVersion).toBe(1);
    expect(triage.entries[0]?.evidencePaths).toEqual([]);
  });

  it.each(['product-bug', 'flaky', 'stale-selector', 'environment', 'uncertain'])(
    'accepts the category %s',
    (category) => {
      expect(TriageEntrySchema.safeParse({ ...ENTRY, category }).success).toBe(true);
    },
  );

  it.each([
    ['an unknown category', { category: 'cosmic-rays' }],
    ['no reasons', { reasons: [] }],
    ['an empty reason', { reasons: [''] }],
    ['an unknown confidence', { confidence: 'certain' }],
  ])('rejects an entry with %s', (_name, override) => {
    expect(TriageEntrySchema.safeParse({ ...ENTRY, ...override }).success).toBe(false);
  });

  it('rejects a triage with no entries and a run id that could leave its folder', () => {
    const base = { runId: 'run-1', entries: [ENTRY], createdAt: '2026-10-17T09:00:00Z' };

    expect(TriageSchema.safeParse({ ...base, entries: [] }).success).toBe(false);
    expect(TriageSchema.safeParse({ ...base, runId: '../escape' }).success).toBe(false);
  });
});

describe('TriageInputSchema', () => {
  it('accepts an input with no failures', () => {
    expect(
      TriageInputSchema.safeParse({ runId: 'run-1', failures: [], omittedFailureCount: 0 }).success,
    ).toBe(true);
  });
});
