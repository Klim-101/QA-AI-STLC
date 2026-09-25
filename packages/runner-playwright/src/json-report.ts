// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

// The narrow slice of Playwright's `--reporter=json` output this runner reads, defined as a Zod
// schema rather than trusted against `@playwright/test/reporter`'s own `JSONReport` type: that
// type describes the in-process reporter API, where `startTime` is a `Date`, but the file this
// runner actually parses went through `JSON.stringify`/`JSON.parse` first, where it is a string.
// Validating the real on-disk shape catches that mismatch instead of trusting an inapplicable type.
const AnnotationSchema = z.object({
  type: z.string(),
  description: z.string().optional(),
});

// `test.step()` calls nest (a step can contain further steps); Playwright's own report mirrors
// that with a recursive `steps` array, so this schema does too.
interface StepResult {
  readonly title: string;
  readonly steps?: readonly StepResult[] | undefined;
}
const StepResultSchema: z.ZodType<StepResult> = z.lazy(() =>
  z.object({
    title: z.string(),
    steps: z.array(StepResultSchema).optional(),
  }),
);

const TestResultSchema = z.object({
  status: z.enum(['passed', 'failed', 'timedOut', 'skipped', 'interrupted']),
  startTime: z.string(),
  duration: z.number(),
  errors: z.array(z.object({ message: z.string().optional() })),
  steps: z.array(StepResultSchema).optional(),
});

const TestSchema = z.object({
  annotations: z.array(AnnotationSchema),
  results: z.array(TestResultSchema),
});

const SpecSchema = z.object({
  title: z.string(),
  tests: z.array(TestSchema),
});

interface Suite {
  readonly suites?: readonly Suite[] | undefined;
  readonly specs?: readonly z.infer<typeof SpecSchema>[] | undefined;
}

const SuiteSchema: z.ZodType<Suite> = z.lazy(() =>
  z.object({
    suites: z.array(SuiteSchema).optional(),
    specs: z.array(SpecSchema).optional(),
  }),
);

export const PlaywrightJsonReportSchema = z.object({
  suites: z.array(SuiteSchema),
});
export type PlaywrightJsonReport = z.infer<typeof PlaywrightJsonReportSchema>;
export type PlaywrightSpec = z.infer<typeof SpecSchema>;
export type PlaywrightTestResult = z.infer<typeof TestResultSchema>;
export type PlaywrightStepResult = StepResult;

// The step/expected-result coverage convention (P3-02): a generated or hand-written spec titles
// each `test.step()` call `[<id>] <description>`, where `<id>` matches an ID the test case
// declares in its own `stepIds` annotation. Only the leading bracket is parsed; the rest of the
// title is free text for humans reading the Playwright report.
const STEP_ID_PATTERN = /^\[([^[\]]+)]/;

/** Flattens a test result's own step tree, depth first, and extracts each step's declared ID. */
export function collectStepIds(steps: readonly StepResult[] | undefined): readonly string[] {
  const ids: string[] = [];
  const visit = (candidates: readonly StepResult[]): void => {
    for (const step of candidates) {
      const match = STEP_ID_PATTERN.exec(step.title);
      if (match?.[1] !== undefined) {
        ids.push(match[1]);
      }
      visit(step.steps ?? []);
    }
  };
  visit(steps ?? []);
  return ids;
}

/** Flattens the report's nested suite tree into the specs it actually ran, depth first. */
export function collectSpecs(report: PlaywrightJsonReport): readonly PlaywrightSpec[] {
  const specs: PlaywrightSpec[] = [];
  const visit = (suite: Suite): void => {
    for (const spec of suite.specs ?? []) {
      specs.push(spec);
    }
    for (const child of suite.suites ?? []) {
      visit(child);
    }
  };
  for (const suite of report.suites) {
    visit(suite);
  }
  return specs;
}
