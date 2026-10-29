// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { TestCase } from '@qa-ai-stlc/schemas';
import { QaError } from './errors.js';
import { COMMON_SELECTOR_FORMS, findUnsupportedSelectorEngine } from './selector-forms.js';
import { STEP_ID_PREFIX } from './step-ids.js';

/**
 * Throws `CASE_SELECTOR_UNSUPPORTED` for the first selector of the case that the browser tools
 * cannot execute, naming the step (or the result) it sits in. The same check runs when a browser
 * tool receives a selector, so the two cannot disagree.
 */
export function assertCaseSelectorsSupported(
  testCase: Pick<TestCase, 'id' | 'steps' | 'resultExpectations'>,
): void {
  const declared = [
    ...testCase.steps.flatMap((step, index) =>
      (step.expectations ?? []).map((expectation) => ({
        where: `step ${String(index + 1)} (${STEP_ID_PREFIX}${String(index + 1)})`,
        expectation,
      })),
    ),
    ...(testCase.resultExpectations ?? []).map((expectation) => ({
      where: 'the result expectations',
      expectation,
    })),
  ];
  for (const { where, expectation } of declared) {
    if (!('selector' in expectation)) {
      continue;
    }
    const engine = findUnsupportedSelectorEngine(expectation.selector);
    if (engine !== undefined) {
      throw new QaError(
        'CASE_SELECTOR_UNSUPPORTED',
        `Case "${testCase.id}", ${where}: the selector "${expectation.selector}" uses the engine "${engine}", which the browser tools cannot execute.`,
        { remediation: `Use one of: ${COMMON_SELECTOR_FORMS.join('; ')}.` },
      );
    }
  }
}
