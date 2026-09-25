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

const TestResultSchema = z.object({
  status: z.enum(['passed', 'failed', 'timedOut', 'skipped', 'interrupted']),
  startTime: z.string(),
  duration: z.number(),
  errors: z.array(z.object({ message: z.string().optional() })),
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
