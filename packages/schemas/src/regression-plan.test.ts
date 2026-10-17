// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { RegressionPlanSchema, RegressionSpecRunSchema } from './regression-plan.js';

describe('RegressionPlanSchema', () => {
  it('accepts a plan and defaults the schema version', () => {
    const plan = RegressionPlanSchema.parse({
      maxTier: 'smoke',
      included: [
        {
          testCaseId: 'login',
          title: 'Log in',
          tier: 'smoke',
          testType: 'e2e',
          route: 'spec',
          routeReason: 'verified-spec',
          specPath: 'tests/login.spec.ts',
        },
      ],
      excluded: [{ testCaseId: 'idea', title: 'Idea', reason: 'not-approved' }],
      specRuns: [{ testType: 'e2e', specFiles: ['tests/login.spec.ts'] }],
    });

    expect(plan.schemaVersion).toBe(1);
  });

  it.each([
    ['a tier that is not one', { maxTier: 'weekly' }],
    [
      'an exclusion reason the engine does not give',
      { excluded: [{ testCaseId: 'x', title: 'X', reason: 'boring' }] },
    ],
  ])('rejects a plan with %s', (_name, override) => {
    expect(
      RegressionPlanSchema.safeParse({
        maxTier: 'smoke',
        included: [],
        excluded: [],
        specRuns: [],
        ...override,
      }).success,
    ).toBe(false);
  });

  it('wants a spec run to name at least one spec', () => {
    expect(RegressionSpecRunSchema.safeParse({ testType: 'e2e', specFiles: [] }).success).toBe(false);
  });
});
