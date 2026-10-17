// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runRegressionPlan } from '@qa-ai-stlc/core';
import { RegressionPlanSchema, RegressionTierSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  maxTier: RegressionTierSchema.describe(
    'The widest tier to include, in the order smoke, critical-path, regression, extended: "regression" takes every case of the first three.',
  ),
});

/**
 * `qa.regression_plan` (P4-09): the regression pack for a tier threshold, selected by the engine.
 */
export const regressionPlanTool: ToolDefinition<typeof InputSchema, typeof RegressionPlanSchema> = {
  name: 'qa.regression_plan',
  description:
    'Selects the regression pack for a tier threshold from the registered cases, the run history and ' +
    'the verifications the engine holds, and runs nothing. A case is in when it is approved, its ' +
    'regressionTier is at or below maxTier (smoke < critical-path < regression < extended) and its ' +
    'recorded history is not flaky by the configured thresholds. Each included case is routed to ' +
    '"spec" (a verified generated spec still stands: run specRuns with qa.run, one call per test ' +
    'type) or to "live" (qa-execute it; routeReason says why there is no spec: no-verified-spec, ' +
    'stale-spec when the case was registered again after the spec was verified, spec-changed when ' +
    'the spec file is missing or edited). Each excluded case carries its reason: not-approved, ' +
    'no-tier, tier-above-threshold or flaky.',
  inputSchema: InputSchema,
  outputSchema: RegressionPlanSchema,
  handler: (input) => runRegressionPlan(createNodeEngineContext(), { maxTier: input.maxTier }),
};
