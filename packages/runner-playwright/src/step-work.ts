// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

// What the Playwright process itself observed inside one `[<id>]` step, counted by the category
// Playwright gives each step. The generated code chooses a step's title, but not these: an action
// on a page or request context is reported as `pw:api`, and an assertion as `expect`, no matter
// what the surrounding `test.step()` is called.
export const StepWorkSchema = z.object({
  actions: z.number().int().nonnegative(),
  assertions: z.number().int().nonnegative(),
  webFirstAssertions: z.number().int().nonnegative(),
});
export type StepWork = z.infer<typeof StepWorkSchema>;

/** Step work by `[<id>]`, per test case id; the file the step-work reporter writes. */
export const StepWorkReportSchema = z.record(z.string(), z.record(z.string(), StepWorkSchema));
export type StepWorkReport = z.infer<typeof StepWorkReportSchema>;

// Playwright's matchers that retry against a page, locator or response (`customAsyncMatchers` in
// `playwright/lib/matchers/expect.js`). A generic matcher (`toBe`, `toEqual`) can compare two
// literals and prove nothing about the application, so it does not count as a check of a browser
// page. `toPass` is left out: it only wraps assertions that are counted themselves.
const WEB_FIRST_MATCHERS: ReadonlySet<string> = new Set([
  'toBeAttached',
  'toBeChecked',
  'toBeDisabled',
  'toBeEditable',
  'toBeEmpty',
  'toBeEnabled',
  'toBeFocused',
  'toBeHidden',
  'toBeInViewport',
  'toBeOK',
  'toBeVisible',
  'toContainText',
  'toContainClass',
  'toHaveAccessibleDescription',
  'toHaveAccessibleName',
  'toHaveAccessibleErrorMessage',
  'toHaveAttribute',
  'toHaveClass',
  'toHaveCount',
  'toHaveCSS',
  'toHaveId',
  'toHaveJSProperty',
  'toHaveRole',
  'toHaveText',
  'toHaveTitle',
  'toHaveURL',
  'toHaveValue',
  'toHaveValues',
  'toHaveScreenshot',
  'toMatchAriaSnapshot',
]);

const EXPECT_STEP_TITLE = /^Expect "([^"]+)"/;

export type StepCategory = 'pw:api' | 'expect';

/** The kind of work one finished Playwright step is, or `undefined` for a step that is neither (a hook, a fixture, a `test.step`). */
export function classifyStep(
  category: string,
  title: string,
): { readonly category: StepCategory; readonly isWebFirst: boolean } | undefined {
  if (category === 'pw:api') {
    return { category: 'pw:api', isWebFirst: false };
  }
  if (category === 'expect') {
    const matcher = EXPECT_STEP_TITLE.exec(title)?.[1];
    return { category: 'expect', isWebFirst: matcher !== undefined && WEB_FIRST_MATCHERS.has(matcher) };
  }
  return undefined;
}

const NO_WORK: StepWork = { actions: 0, assertions: 0, webFirstAssertions: 0 };

/** Accumulates the work done inside each step id of one test attempt. */
export class StepWorkRecorder {
  private readonly workByStepId = new Map<string, StepWork>();

  /** Credits one finished action or assertion to every enclosing `[<id>]` step. */
  record(
    work: { readonly category: StepCategory; readonly isWebFirst: boolean },
    enclosingStepIds: readonly string[],
  ): void {
    for (const stepId of enclosingStepIds) {
      const current = this.workByStepId.get(stepId) ?? NO_WORK;
      this.workByStepId.set(stepId, {
        actions: current.actions + (work.category === 'pw:api' ? 1 : 0),
        assertions: current.assertions + (work.category === 'expect' ? 1 : 0),
        webFirstAssertions:
          current.webFirstAssertions + (work.category === 'expect' && work.isWebFirst ? 1 : 0),
      });
    }
  }

  toRecord(): Record<string, StepWork> {
    return Object.fromEntries(this.workByStepId);
  }
}

/**
 * What the expected-result step must contain. A browser test needs a web-first assertion, because a
 * generic matcher can compare two literals; an API test checks plain values (`expect(status).toBe`),
 * so any assertion counts; an accessibility test checks through a scan helper, not through `expect`,
 * so it is held to the same "did some work" rule as every other step.
 */
export type ExpectedResultCheck = 'web-first-assertion' | 'any-assertion' | 'any-work';

/**
 * The step ids that ran but did no work worth the name: a step must contain at least one action
 * or assertion, and the expected result must contain the check its test type calls for. A step that
 * never ran is already reported as missing by the title check and is not repeated here.
 */
export function findStepsWithoutWork(
  requiredStepIds: readonly string[],
  expectedResultStepId: string,
  work: Readonly<Record<string, StepWork>>,
  expectedResultCheck: ExpectedResultCheck,
): readonly string[] {
  return requiredStepIds.filter((stepId) => {
    const observed = work[stepId] ?? NO_WORK;
    if (stepId === expectedResultStepId && expectedResultCheck !== 'any-work') {
      return (
        (expectedResultCheck === 'web-first-assertion'
          ? observed.webFirstAssertions
          : observed.assertions) === 0
      );
    }
    return observed.actions + observed.assertions === 0;
  });
}
