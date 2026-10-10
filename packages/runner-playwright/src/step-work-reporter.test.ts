// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestCase, TestResult, TestStep } from '@playwright/test/reporter';
import { afterEach, describe, expect, it } from 'vitest';
import StepWorkReporter from './step-work-reporter.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function newOutputFile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'qa-step-work-'));
  directories.push(directory);
  return join(directory, 'step-work.json');
}

function testCase(caseId: string | undefined): TestCase {
  return {
    annotations: caseId === undefined ? [] : [{ type: 'testCaseId', description: caseId }],
  } as unknown as TestCase;
}

function step(category: string, title: string, parent?: TestStep): TestStep {
  return { category, title, parent } as unknown as TestStep;
}

function attempt(retry = 0): TestResult {
  return { retry } as unknown as TestResult;
}

const result = attempt();

function readReport(outputFile: string): unknown {
  return JSON.parse(readFileSync(outputFile, 'utf8')) as unknown;
}

describe('StepWorkReporter', () => {
  it('writes the work done inside each [id] step of a test case', () => {
    const outputFile = newOutputFile();
    const reporter = new StepWorkReporter({ outputFile });
    const test = testCase('case-1');
    const stepOne = step('test.step', '[step-1] Open the page');
    const outer = step('test.step', '[outer] Group');
    const nested = step('test.step', '[step-2] Check', outer);

    reporter.onTestBegin(test, result);
    reporter.onStepEnd(test, result, step('pw:api', 'Click', stepOne));
    reporter.onStepEnd(test, result, step('expect', 'Expect "toBeVisible"', nested));
    reporter.onStepEnd(test, result, step('pw:api', 'Launch browser'));
    reporter.onStepEnd(test, result, step('fixture', 'Fixture "page"', stepOne));
    reporter.onEnd();

    expect(readReport(outputFile)).toEqual({
      'case-1': {
        'step-1': { actions: 1, assertions: 0, webFirstAssertions: 0 },
        'step-2': { actions: 0, assertions: 1, webFirstAssertions: 1 },
        outer: { actions: 0, assertions: 1, webFirstAssertions: 1 },
      },
    });
  });

  it('starts from nothing on a retry, so only the last attempt counts', () => {
    const outputFile = newOutputFile();
    const reporter = new StepWorkReporter({ outputFile });
    const test = testCase('case-1');
    const first = step('test.step', '[step-1] Act');

    reporter.onTestBegin(test, attempt(0));
    reporter.onStepEnd(test, attempt(0), step('pw:api', 'Click', first));
    reporter.onTestBegin(test, attempt(1));
    reporter.onStepEnd(test, attempt(0), step('pw:api', 'Click', first));
    reporter.onEnd();

    expect(readReport(outputFile)).toEqual({ 'case-1': {} });
  });

  it('ignores a test with no testCaseId, and a step of a test that never began', () => {
    const outputFile = newOutputFile();
    const reporter = new StepWorkReporter({ outputFile });
    const anonymous = testCase(undefined);
    const act = step('pw:api', 'Click', step('test.step', '[step-1] Act'));

    reporter.onTestBegin(anonymous, result);
    reporter.onStepEnd(anonymous, result, act);
    reporter.onStepEnd(testCase('case-2'), result, act);
    reporter.onEnd();

    expect(readReport(outputFile)).toEqual({});
  });

  it('ignores a step whose enclosing step is not a test.step', () => {
    const outputFile = newOutputFile();
    const reporter = new StepWorkReporter({ outputFile });
    const test = testCase('case-1');

    reporter.onTestBegin(test, result);
    reporter.onStepEnd(test, result, step('pw:api', 'Click', step('hook', '[step-1] Not a step')));
    reporter.onEnd();

    expect(readReport(outputFile)).toEqual({ 'case-1': {} });
  });
});
