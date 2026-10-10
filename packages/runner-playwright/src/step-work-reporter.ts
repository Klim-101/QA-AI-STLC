// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { writeFileSync } from 'node:fs';
import type { Reporter, TestCase, TestResult, TestStep } from '@playwright/test/reporter';
import { classifyStep, StepWorkRecorder, type StepWork } from './step-work.js';

// Same convention the title check uses (`json-report.ts`): `test.step('[<id>] ...')`.
const STEP_ID_PATTERN = /^\[([^[\]]+)]/;

function enclosingStepIds(step: TestStep): string[] {
  const ids: string[] = [];
  for (let ancestor = step.parent; ancestor !== undefined; ancestor = ancestor.parent) {
    const id = STEP_ID_PATTERN.exec(ancestor.title)?.[1];
    if (id !== undefined && ancestor.category === 'test.step') {
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Writes, per test case, how many actions and assertions Playwright itself saw inside each
 * `[<id>]` step. The JSON reporter only lists the `test.step` titles, which generated code
 * chooses; the step categories are only visible here (`onStepEnd`).
 */
class StepWorkReporter implements Reporter {
  private readonly attempts = new Map<
    string,
    { readonly retry: number; readonly recorder: StepWorkRecorder }
  >();
  private readonly outputFile: string;

  constructor(options: { readonly outputFile: string }) {
    this.outputFile = options.outputFile;
  }

  onTestBegin(test: TestCase, result: TestResult): void {
    const caseId = test.annotations.find((annotation) => annotation.type === 'testCaseId')?.description;
    // A retry starts from nothing: only the last attempt, the one the JSON report maps, counts.
    if (caseId !== undefined) {
      this.attempts.set(caseId, { retry: result.retry, recorder: new StepWorkRecorder() });
    }
  }

  onStepEnd(test: TestCase, result: TestResult, step: TestStep): void {
    const caseId = test.annotations.find((annotation) => annotation.type === 'testCaseId')?.description;
    const work = classifyStep(step.category, step.title);
    if (caseId === undefined || work === undefined) {
      return;
    }
    const attempt = this.attempts.get(caseId);
    // A step that ends late from an earlier attempt must not count towards the current one.
    if (attempt?.retry === result.retry) {
      attempt.recorder.record(work, enclosingStepIds(step));
    }
  }

  onEnd(): void {
    const report: Record<string, Record<string, StepWork>> = {};
    for (const [caseId, attempt] of this.attempts) {
      report[caseId] = attempt.recorder.toRecord();
    }
    writeFileSync(this.outputFile, JSON.stringify(report));
  }
}

// Playwright's reporter loader reads the default export, the one place this project cannot use named exports.
export default StepWorkReporter;
