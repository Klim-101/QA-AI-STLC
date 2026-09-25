// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError } from '@qa-ai-stlc/core';
import { describe, expect, it } from 'vitest';
import type { PlaywrightJsonReport } from './json-report.js';
import { mapReportToRunResults } from './map-result.js';

interface AnnotationOverride {
  readonly type: string;
  readonly description?: string;
}

function reportWithOneTest(overrides: {
  readonly status?: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  readonly annotations?: readonly AnnotationOverride[];
  readonly errorMessage?: string;
}): PlaywrightJsonReport {
  return {
    suites: [
      {
        specs: [
          {
            title: 'a case',
            tests: [
              {
                annotations: [...(overrides.annotations ?? [{ type: 'testCaseId', description: 'tc-1' }])],
                results: [
                  {
                    status: overrides.status ?? 'passed',
                    startTime: '2026-09-25T10:00:00.000Z',
                    duration: 1500,
                    errors: overrides.errorMessage !== undefined ? [{ message: overrides.errorMessage }] : [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('mapReportToRunResults', () => {
  it('maps a passed test to a passed run result with no failure', () => {
    const [result] = mapReportToRunResults({
      report: reportWithOneTest({ status: 'passed' }),
      runId: 'run-1',
      testType: 'e2e',
      idGenerator: { next: () => 'fixed-id' },
    });
    expect(result).toMatchObject({
      id: 'run-result-fixed-id',
      runId: 'run-1',
      testCaseId: 'tc-1',
      testType: 'e2e',
      status: 'passed',
      startedAt: '2026-09-25T10:00:00.000Z',
      finishedAt: '2026-09-25T10:00:01.500Z',
      evidenceIds: [],
    });
    expect(result?.failure).toBeUndefined();
  });

  it.each([
    ['failed', 'failed'],
    ['timedOut', 'failed'],
    ['skipped', 'skipped'],
    ['interrupted', 'blocked'],
  ] as const)('maps Playwright status %s to run result status %s', (playwrightStatus, expectedStatus) => {
    const [result] = mapReportToRunResults({
      report: reportWithOneTest({ status: playwrightStatus, errorMessage: 'boom' }),
      runId: 'run-1',
      testType: 'e2e',
    });
    expect(result?.status).toBe(expectedStatus);
  });

  it('strips ANSI escape codes from a failure message', () => {
    const [result] = mapReportToRunResults({
      report: reportWithOneTest({ status: 'failed', errorMessage: '\u001b[31mExpected 2\u001b[39m' }),
      runId: 'run-1',
      testType: 'e2e',
    });
    expect(result?.failure?.message).toBe('Expected 2');
  });

  it('falls back to a default message when a failed result has no error', () => {
    const [result] = mapReportToRunResults({
      report: reportWithOneTest({ status: 'failed' }),
      runId: 'run-1',
      testType: 'e2e',
    });
    expect(result?.failure?.message).toBe('Playwright reported a failure with no error message.');
  });

  it('throws a QaError when a test has no testCaseId annotation', () => {
    expect(() =>
      mapReportToRunResults({
        report: reportWithOneTest({ annotations: [] }),
        runId: 'run-1',
        testType: 'e2e',
      }),
    ).toThrow(QaError);
  });

  it('throws a QaError when a test produced no result', () => {
    const report: PlaywrightJsonReport = {
      suites: [{ specs: [{ title: 'no result', tests: [{ annotations: [], results: [] }] }] }],
    };
    expect(() => mapReportToRunResults({ report, runId: 'run-1', testType: 'e2e' })).toThrow(QaError);
  });
});
