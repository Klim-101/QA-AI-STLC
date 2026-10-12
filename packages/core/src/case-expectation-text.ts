// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { CaseExpectation } from '@qa-ai-stlc/schemas';

/** A structured expectation in one line, the same way in reports, reviews and error messages. */
export function describeCaseExpectation(expectation: CaseExpectation): string {
  const target = 'selector' in expectation ? ` on "${expectation.selector}"` : '';
  const expected =
    'expected' in expectation && expectation.expected !== undefined
      ? ` = ${JSON.stringify(expectation.expected)}`
      : '';
  return `${expectation.kind}${target}${expected}`;
}
