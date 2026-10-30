// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { EvalBugSignalSchema, EvalExpectedBugSchema, EvalScenarioSchema } from './eval.js';

describe('EvalScenarioSchema', () => {
  const bug = { bugId: 'BUG-002', signals: [{ kind: 'failed-case', testCaseId: 'filter' }] };

  it('accepts a scenario and defaults the schema version', () => {
    const scenario = EvalScenarioSchema.parse({
      id: 'baseline-demo-app',
      title: 'Baseline',
      expectedBugs: [bug],
    });

    expect(scenario.schemaVersion).toBe(1);
  });

  it.each([
    ['no expected bug', { expectedBugs: [] }],
    ['an id that is not kebab-case', { id: 'Not Kebab' }],
    ['a bug id of the wrong shape', { expectedBugs: [{ ...bug, bugId: 'bug-2' }] }],
    ['a bug with no signal', { expectedBugs: [{ ...bug, signals: [] }] }],
  ])('rejects a scenario with %s', (_name, override) => {
    expect(
      EvalScenarioSchema.safeParse({ id: 'demo', title: 'Demo', expectedBugs: [bug], ...override }).success,
    ).toBe(false);
  });
});

describe('EvalBugSignalSchema', () => {
  it('accepts a defect title pattern that is a regular expression and rejects one that is not', () => {
    expect(EvalBugSignalSchema.safeParse({ kind: 'defect-title', pattern: 'sort(ing)?' }).success).toBe(true);
    expect(EvalBugSignalSchema.safeParse({ kind: 'defect-title', pattern: '(unclosed' }).success).toBe(false);
  });

  it('accepts a requirement signal and rejects one without a requirement id', () => {
    expect(
      EvalBugSignalSchema.safeParse({ kind: 'requirement', requirementId: 'req-002-filter' }).success,
    ).toBe(true);
    expect(EvalBugSignalSchema.safeParse({ kind: 'requirement' }).success).toBe(false);
  });

  it('is part of an expected bug', () => {
    expect(
      EvalExpectedBugSchema.safeParse({
        bugId: 'BUG-001',
        signals: [{ kind: 'failed-case', testCaseId: 'x' }],
      }).success,
    ).toBe(true);
  });
});
