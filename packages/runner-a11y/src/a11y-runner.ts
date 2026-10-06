// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { finalizeA11yOutcome, prepareA11yRun, type Runner } from '@qa-ai-stlc/core';
import { runPlaywrightSpecs } from '@qa-ai-stlc/runner-playwright';

/**
 * Runs `a11y` specs through the shared Playwright mechanics (P6-05). A spec navigates and calls the
 * generated `scanAccessibility(page, testInfo)` helper; the runner hands the helper the axe-core
 * plan derived from the `a11y` configuration (WCAG version and level, selectors), then registers
 * each attached scan as `a11y-scan` evidence and sets the case's status from it: violations fail
 * the case, `incomplete` results leave it `uncertain`, and a case that never scanned is rejected.
 */
export const a11yRunner: Runner = {
  testType: 'a11y',
  async run(engine, input) {
    const preparation = await prepareA11yRun(engine);
    const outcomes = await runPlaywrightSpecs(engine, input, 'a11y', {
      env: preparation.environment,
      extraEvidenceKindsByContentType: preparation.evidenceKindsByContentType,
    });
    const today = engine.clock.now().toISOString().slice(0, 10);
    return outcomes.map((outcome) => finalizeA11yOutcome(outcome, preparation, today));
  },
};
