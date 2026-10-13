// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import type { PlaywrightJsonReport } from './json-report.js';
import { describeLoadFailure } from './load-failure.js';

const RAN_ONE_TEST: PlaywrightJsonReport['suites'] = [
  { specs: [{ title: 'a test', tests: [{ annotations: [], results: [] }] }] },
];

function report(
  errors: readonly { message?: string }[],
  suites: PlaywrightJsonReport['suites'] = [],
): PlaywrightJsonReport {
  return { suites, errors: [...errors] };
}

describe('describeLoadFailure', () => {
  it('names the error Playwright gave when a spec failed to load', () => {
    const failure = describeLoadFailure(
      report([
        { message: '\u001b[31mError: Playwright Test did not expect test() to be called here.\u001b[39m' },
        { message: 'Error: No tests found' },
      ]),
    );

    expect(failure).toBe('Error: Playwright Test did not expect test() to be called here.');
  });

  it('caps a long message', () => {
    const failure = describeLoadFailure(report([{ message: `Error: ${'x'.repeat(700)}` }]));

    expect(failure).toHaveLength(601);
    expect(failure?.endsWith('…')).toBe(true);
  });

  it('is undefined when the only complaint is that nothing matched', () => {
    expect(describeLoadFailure(report([{ message: 'Error: No tests found' }]))).toBeUndefined();
  });

  it('is undefined when there is no error, or an error without a message', () => {
    expect(describeLoadFailure(report([]))).toBeUndefined();
    expect(describeLoadFailure(report([{}]))).toBeUndefined();
  });

  it('is undefined when tests ran, whatever else was reported', () => {
    expect(describeLoadFailure(report([{ message: 'Error: boom' }], RAN_ONE_TEST))).toBeUndefined();
  });
});
