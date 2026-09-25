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
  readonly stepTitles?: readonly string[];
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
                    steps: overrides.stepTitles?.map((title) => ({ title })),
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

  describe('step coverage', () => {
    it('ignores step coverage for a test with no "stepIds" annotation', () => {
      const [result] = mapReportToRunResults({
        report: reportWithOneTest({ status: 'passed', stepTitles: ['[step-1] Do the thing'] }),
        runId: 'run-1',
        testType: 'e2e',
      });
      expect(result?.status).toBe('passed');
      expect(result?.missingStepIds).toBeUndefined();
    });

    it('stays "passed" when every declared step ID was observed', () => {
      const [result] = mapReportToRunResults({
        report: reportWithOneTest({
          status: 'passed',
          annotations: [
            { type: 'testCaseId', description: 'tc-1' },
            { type: 'stepIds', description: 'step-1, step-2, expected-result' },
          ],
          stepTitles: ['[step-1] Fill in the form', '[step-2] Submit', '[expected-result] Dashboard shown'],
        }),
        runId: 'run-1',
        testType: 'e2e',
      });
      expect(result?.status).toBe('passed');
      expect(result?.missingStepIds).toBeUndefined();
    });

    it('reports "partial" with the missing step IDs when a failed test did not reach every step', () => {
      const [result] = mapReportToRunResults({
        report: reportWithOneTest({
          status: 'failed',
          errorMessage: 'Expected the dashboard, got the login page',
          annotations: [
            { type: 'testCaseId', description: 'tc-1' },
            { type: 'stepIds', description: 'step-1,step-2,expected-result' },
          ],
          stepTitles: ['[step-1] Fill in the form', '[step-2] Submit'],
        }),
        runId: 'run-1',
        testType: 'e2e',
      });
      expect(result?.status).toBe('partial');
      expect(result?.missingStepIds).toEqual(['expected-result']);
      expect(result?.failure?.message).toBe('Expected the dashboard, got the login page');
    });

    it('reports "partial" with a coverage message when no Playwright error explains the gap', () => {
      const [result] = mapReportToRunResults({
        report: reportWithOneTest({
          status: 'passed',
          annotations: [
            { type: 'testCaseId', description: 'tc-1' },
            { type: 'stepIds', description: 'step-1,step-2' },
          ],
          stepTitles: ['[step-1] Fill in the form'],
        }),
        runId: 'run-1',
        testType: 'e2e',
      });
      expect(result?.status).toBe('partial');
      expect(result?.missingStepIds).toEqual(['step-2']);
      expect(result?.failure?.message).toBe('Missing step coverage for: step-2.');
    });

    it('does not override an honest "blocked" status with "partial"', () => {
      const [result] = mapReportToRunResults({
        report: reportWithOneTest({
          status: 'interrupted',
          annotations: [
            { type: 'testCaseId', description: 'tc-1' },
            { type: 'stepIds', description: 'step-1,step-2' },
          ],
          stepTitles: [],
        }),
        runId: 'run-1',
        testType: 'e2e',
      });
      expect(result?.status).toBe('blocked');
      expect(result?.missingStepIds).toBeUndefined();
    });
  });
});
