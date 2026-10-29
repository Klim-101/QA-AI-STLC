// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { TestCase } from '@qa-ai-stlc/schemas';
import { describeCaseExpectation } from '../case-expectation-text.js';

/**
 * Renders a `TestCaseSchema` artifact as a numbered, presentable Markdown document (ADR-002):
 * metadata, numbered preconditions, numbered steps and the expected result. The test-case
 * renderer registered under `'test-case'` in `markdown-registry.ts`.
 */
export function renderTestCaseMarkdown(testCase: TestCase): string {
  const sections: string[] = [`# ${testCase.title}`];

  if (testCase.description !== undefined) {
    sections.push(testCase.description);
  }

  sections.push(renderMetadata(testCase));

  if (testCase.preconditions !== undefined && testCase.preconditions.length > 0) {
    sections.push(['## Preconditions', '', renderNumberedList(testCase.preconditions)].join('\n'));
  }

  sections.push(['## Steps', '', renderNumberedList(testCase.steps.map(renderStep))].join('\n'));
  sections.push(['## Expected result', '', testCase.expectedResult].join('\n'));
  if (testCase.resultExpectations !== undefined) {
    sections.push(
      [
        '### Checked by the engine',
        '',
        ...testCase.resultExpectations.map((expectation) => `- ${describeCaseExpectation(expectation)}`),
      ].join('\n'),
    );
  }

  if (testCase.manualChecks !== undefined) {
    sections.push(
      ['### Checked by a person', '', ...testCase.manualChecks.map((check) => `- ${check}`)].join('\n'),
    );
  }

  return `${sections.join('\n\n')}\n`;
}

function renderMetadata(testCase: TestCase): string {
  const rows = [
    `**Feature:** ${testCase.feature}`,
    `**Requirements:** ${testCase.requirementIds.join(', ')}`,
    `**Test type:** ${testCase.testType}`,
    ...(testCase.regressionTier !== undefined ? [`**Regression tier:** ${testCase.regressionTier}`] : []),
    `**Status:** ${testCase.status}`,
  ];
  return rows.join('\n');
}

// A step's engine-checked expectations hang under it, indented to stay inside the list item.
function renderStep(step: TestCase['steps'][number]): string {
  const checks = (step.expectations ?? []).map(
    (expectation) => `   - Expect: ${describeCaseExpectation(expectation)}`,
  );
  return [step.description, ...checks].join('\n');
}

function renderNumberedList(items: readonly string[]): string {
  return items.map((item, index) => `${String(index + 1)}. ${item}`).join('\n');
}
