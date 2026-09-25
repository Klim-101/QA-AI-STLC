// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError, type FileSystem } from '@qa-ai-stlc/core';
import { describe, expect, it } from 'vitest';
import type { PlaywrightJsonReport } from './json-report.js';
import { mapReportToRunResults } from './map-result.js';

interface AnnotationOverride {
  readonly type: string;
  readonly description?: string;
}

interface AttachmentOverride {
  readonly name: string;
  readonly contentType: string;
  readonly path?: string;
  readonly body?: string;
}

function reportWithOneTest(overrides: {
  readonly status?: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  readonly annotations?: readonly AnnotationOverride[];
  readonly errorMessage?: string;
  readonly stepTitles?: readonly string[];
  readonly attachments?: readonly AttachmentOverride[];
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
                    attachments: [...(overrides.attachments ?? [])],
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

/** A `FileSystem` whose only meaningful op is `readBytes`, returning fixed bytes for any path. */
function fakeFileSystem(bytesByPath: Readonly<Record<string, Uint8Array>> = {}): FileSystem {
  return {
    readFile: () => Promise.reject(new Error('not implemented')),
    readBytes: (absolutePath) => {
      const bytes = bytesByPath[absolutePath];
      if (bytes === undefined) {
        return Promise.reject(new Error(`no fake bytes for ${absolutePath}`));
      }
      return Promise.resolve(bytes);
    },
    writeFile: () => Promise.reject(new Error('not implemented')),
    mkdir: () => Promise.reject(new Error('not implemented')),
    pathExists: () => Promise.reject(new Error('not implemented')),
    listFiles: () => Promise.reject(new Error('not implemented')),
  };
}

describe('mapReportToRunResults', () => {
  it('maps a passed test to a passed run result with no failure', async () => {
    const [outcome] = await mapReportToRunResults({
      report: reportWithOneTest({ status: 'passed' }),
      runId: 'run-1',
      testType: 'e2e',
      fs: fakeFileSystem(),
      idGenerator: { next: () => 'fixed-id' },
    });
    expect(outcome?.result).toMatchObject({
      id: 'run-result-fixed-id',
      runId: 'run-1',
      testCaseId: 'tc-1',
      testType: 'e2e',
      status: 'passed',
      startedAt: '2026-09-25T10:00:00.000Z',
      finishedAt: '2026-09-25T10:00:01.500Z',
      evidenceIds: [],
    });
    expect(outcome?.result.failure).toBeUndefined();
    expect(outcome?.evidence).toEqual([]);
  });

  it.each([
    ['failed', 'failed'],
    ['timedOut', 'failed'],
    ['skipped', 'skipped'],
    ['interrupted', 'blocked'],
  ] as const)(
    'maps Playwright status %s to run result status %s',
    async (playwrightStatus, expectedStatus) => {
      const [outcome] = await mapReportToRunResults({
        report: reportWithOneTest({ status: playwrightStatus, errorMessage: 'boom' }),
        runId: 'run-1',
        testType: 'e2e',
        fs: fakeFileSystem(),
      });
      expect(outcome?.result.status).toBe(expectedStatus);
    },
  );

  it('strips ANSI escape codes from a failure message', async () => {
    const [outcome] = await mapReportToRunResults({
      report: reportWithOneTest({ status: 'failed', errorMessage: '\u001b[31mExpected 2\u001b[39m' }),
      runId: 'run-1',
      testType: 'e2e',
      fs: fakeFileSystem(),
    });
    expect(outcome?.result.failure?.message).toBe('Expected 2');
  });

  it('falls back to a default message when a failed result has no error', async () => {
    const [outcome] = await mapReportToRunResults({
      report: reportWithOneTest({ status: 'failed' }),
      runId: 'run-1',
      testType: 'e2e',
      fs: fakeFileSystem(),
    });
    expect(outcome?.result.failure?.message).toBe('Playwright reported a failure with no error message.');
  });

  it('throws a QaError when a test has no testCaseId annotation', async () => {
    await expect(
      mapReportToRunResults({
        report: reportWithOneTest({ annotations: [] }),
        runId: 'run-1',
        testType: 'e2e',
        fs: fakeFileSystem(),
      }),
    ).rejects.toThrow(QaError);
  });

  it('throws a QaError when a test produced no result', async () => {
    const report: PlaywrightJsonReport = {
      suites: [{ specs: [{ title: 'no result', tests: [{ annotations: [], results: [] }] }] }],
    };
    await expect(
      mapReportToRunResults({ report, runId: 'run-1', testType: 'e2e', fs: fakeFileSystem() }),
    ).rejects.toThrow(QaError);
  });

  describe('evidence capture', () => {
    it('registers a screenshot attachment read from disk as evidence', async () => {
      const [outcome] = await mapReportToRunResults({
        report: reportWithOneTest({
          status: 'failed',
          errorMessage: 'boom',
          attachments: [{ name: 'screenshot', contentType: 'image/png', path: '/tmp/shot.png' }],
        }),
        runId: 'run-1',
        testType: 'e2e',
        fs: fakeFileSystem({ '/tmp/shot.png': new Uint8Array([1, 2, 3]) }),
      });
      expect(outcome?.evidence).toEqual([{ kind: 'screenshot', content: new Uint8Array([1, 2, 3]) }]);
    });

    it('registers an inline base64 trace attachment as evidence', async () => {
      const [outcome] = await mapReportToRunResults({
        report: reportWithOneTest({
          status: 'failed',
          errorMessage: 'boom',
          attachments: [{ name: 'trace', contentType: 'application/zip', body: 'AQID' }],
        }),
        runId: 'run-1',
        testType: 'e2e',
        fs: fakeFileSystem(),
      });
      expect(outcome?.evidence).toEqual([{ kind: 'trace', content: Buffer.from([1, 2, 3]) }]);
    });

    it('ignores an attachment whose content type this runner does not turn into evidence', async () => {
      const [outcome] = await mapReportToRunResults({
        report: reportWithOneTest({
          status: 'passed',
          attachments: [{ name: 'custom', contentType: 'text/plain', body: 'aGVsbG8=' }],
        }),
        runId: 'run-1',
        testType: 'e2e',
        fs: fakeFileSystem(),
      });
      expect(outcome?.evidence).toEqual([]);
    });

    it('ignores an attachment with neither a path nor an inline body', async () => {
      const [outcome] = await mapReportToRunResults({
        report: reportWithOneTest({
          status: 'passed',
          attachments: [{ name: 'screenshot', contentType: 'image/png' }],
        }),
        runId: 'run-1',
        testType: 'e2e',
        fs: fakeFileSystem(),
      });
      expect(outcome?.evidence).toEqual([]);
    });
  });

  describe('step coverage', () => {
    it('ignores step coverage for a test with no "stepIds" annotation', async () => {
      const [outcome] = await mapReportToRunResults({
        report: reportWithOneTest({ status: 'passed', stepTitles: ['[step-1] Do the thing'] }),
        runId: 'run-1',
        testType: 'e2e',
        fs: fakeFileSystem(),
      });
      expect(outcome?.result.status).toBe('passed');
      expect(outcome?.result.missingStepIds).toBeUndefined();
    });

    it('stays "passed" when every declared step ID was observed', async () => {
      const [outcome] = await mapReportToRunResults({
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
        fs: fakeFileSystem(),
      });
      expect(outcome?.result.status).toBe('passed');
      expect(outcome?.result.missingStepIds).toBeUndefined();
    });

    it('reports "partial" with the missing step IDs when a failed test did not reach every step', async () => {
      const [outcome] = await mapReportToRunResults({
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
        fs: fakeFileSystem(),
      });
      expect(outcome?.result.status).toBe('partial');
      expect(outcome?.result.missingStepIds).toEqual(['expected-result']);
      expect(outcome?.result.failure?.message).toBe('Expected the dashboard, got the login page');
    });

    it('reports "partial" with a coverage message when no Playwright error explains the gap', async () => {
      const [outcome] = await mapReportToRunResults({
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
        fs: fakeFileSystem(),
      });
      expect(outcome?.result.status).toBe('partial');
      expect(outcome?.result.missingStepIds).toEqual(['step-2']);
      expect(outcome?.result.failure?.message).toBe('Missing step coverage for: step-2.');
    });

    it('does not override an honest "blocked" status with "partial"', async () => {
      const [outcome] = await mapReportToRunResults({
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
        fs: fakeFileSystem(),
      });
      expect(outcome?.result.status).toBe('blocked');
      expect(outcome?.result.missingStepIds).toBeUndefined();
    });
  });
});
