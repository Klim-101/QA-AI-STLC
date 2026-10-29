// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { HttpMethodSchema } from './api-surface.js';
import { FeatureIdSchema, IdentifierSchema, IsoDateTimeSchema } from './primitives.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

// Matches the testing scope's four decidable types (development plan section 2.7); security has
// no test cases of its own because the on-demand audit runs outside this pipeline.
export const TestTypeSchema = z.enum(['e2e', 'api', 'a11y']);
export type TestType = z.infer<typeof TestTypeSchema>;

// A check the engine compares against what it observed (ADR-0016), so "actual equals expected" is
// derived from registered evidence and not asserted by whoever executes the case. The browser kinds
// mirror `qa.browser_expect`, the `http-*` kinds read the request `qa.http_execute` registered, and
// `a11y-clean` reads the scan `qa.browser_accessibility_scan` registered.
const ElementSelectorSchema = z.string().min(1);

export const CaseExpectationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('visible'), selector: ElementSelectorSchema }),
  z.object({ kind: z.literal('hidden'), selector: ElementSelectorSchema }),
  z.object({ kind: z.literal('text'), selector: ElementSelectorSchema, expected: z.string() }),
  z.object({ kind: z.literal('value'), selector: ElementSelectorSchema, expected: z.string() }),
  z.object({
    kind: z.literal('count'),
    selector: ElementSelectorSchema,
    expected: z.number().int().nonnegative(),
  }),
  // An absent `expected` means checked, as it does for `qa.browser_expect`.
  z.object({ kind: z.literal('checked'), selector: ElementSelectorSchema, expected: z.boolean().optional() }),
  z.object({ kind: z.literal('url'), expected: z.string().min(1) }),
  z.object({ kind: z.literal('http-status'), expected: z.number().int().min(100).max(599) }),
  z.object({ kind: z.literal('http-body-contains'), expected: z.string().min(1) }),
  z.object({ kind: z.literal('a11y-clean') }),
]);
export type CaseExpectation = z.infer<typeof CaseExpectationSchema>;
export type CaseExpectationKind = CaseExpectation['kind'];

const HTTP_EXPECTATION_KINDS: ReadonlySet<CaseExpectationKind> = new Set([
  'http-status',
  'http-body-contains',
]);

export const TestCaseStepSchema = z.object({
  description: z.string().min(1),
  // Checks observed in this step: a registered record of this step has to meet each one.
  expectations: z.array(CaseExpectationSchema).min(1).optional(),
});
export type TestCaseStep = z.infer<typeof TestCaseStepSchema>;

export const TestCaseStatusSchema = z.enum(['draft', 'approved', 'rejected']);
export type TestCaseStatus = z.infer<typeof TestCaseStatusSchema>;

// ISO/IEC/IEEE 29119- and ISTQB-aligned regression tier (P2-17): one tier per case, not a
// multi-tag set, ordered from the narrowest run to the widest. `qa-regression` (P4-09) selects
// cases by a tier threshold, so the declaration order here is load-bearing, not just documentation
// — `REGRESSION_TIERS`'s index is that ordering, mirroring how `PHASES` (packages/core) keeps a
// pipeline order alongside its schema's enum.
export const REGRESSION_TIERS = ['smoke', 'critical-path', 'regression', 'extended'] as const;
export const RegressionTierSchema = z.enum(REGRESSION_TIERS);
export type RegressionTier = z.infer<typeof RegressionTierSchema>;

// The contract operation an `api` case exercises, in the contract's own path template
// (`/tasks/{taskId}`). `runner-api` (P6-04) checks every one against the configured OpenAPI
// contract before a spec runs and rejects a case that names an operation the contract lacks.
export const TestCaseEndpointSchema = z.object({
  method: HttpMethodSchema,
  path: z.string().startsWith('/'),
});
export type TestCaseEndpoint = z.infer<typeof TestCaseEndpointSchema>;

// Which kinds a case of each type can declare: an api case reads responses, an a11y case reads
// scans (and may still check the page it scans), a browser case reads the page.
function findExpectationMismatch(testType: TestType, kind: CaseExpectationKind): string | undefined {
  if (kind === 'a11y-clean') {
    return testType === 'a11y' ? undefined : '"a11y-clean" applies to an a11y case only';
  }
  const isHttp = HTTP_EXPECTATION_KINDS.has(kind);
  if (isHttp !== (testType === 'api')) {
    return `"${kind}" does not apply to a ${testType} case`;
  }
  return undefined;
}

export const TestCaseSchema = z
  .object({
    schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
    id: IdentifierSchema,
    // The tested feature this case belongs to (P2-20): an explicit, operator-chosen name, never
    // inferred from the title or a requirement id. `qa cases add` registers the case under
    // `artifacts/cases/<feature>/<id>.json`, so every case in a project must declare one.
    feature: FeatureIdSchema,
    // Traceability (development plan section 2.7 step 9, P2-03): every case links to at least one
    // requirement. `qa validate` separately checks that each id actually resolves in the scope
    // artifact — this only rules out a case with no link at all.
    requirementIds: z.array(IdentifierSchema).min(1),
    testType: TestTypeSchema,
    title: z.string().min(1),
    description: z.string().optional(),
    // Optional (P2-17): a case written before `qa-design-cases` (P2-09) existed, or a hand-written
    // one, has neither. `qa-design-cases` sets both on every case it writes; nothing here forces an
    // older case to gain them retroactively.
    preconditions: z.array(z.string().min(1)).optional(),
    steps: z.array(TestCaseStepSchema).min(1),
    expectedResult: z.string().min(1),
    // The checks behind `expectedResult` that the engine can compare itself; observed in any step.
    resultExpectations: z.array(CaseExpectationSchema).min(1).optional(),
    // Checks that only a person can judge (does the layout look right, is the wording suitable). They
    // are not steps: a step is something the executor does or the engine checks, and a step nobody can
    // check mechanically leaves the executor to decide it passed. The engine never evaluates these.
    manualChecks: z.array(z.string().min(1)).min(1).optional(),
    regressionTier: RegressionTierSchema.optional(),
    // Reusable test-data sets this case's steps/preconditions reference by id (P2-22), instead of
    // inlining values another case could share. Optional: a case with no data dependency has none.
    // `qa validate` rejects an id here that does not resolve to a registered `TestDataSchema` set.
    testDataRefs: z.array(IdentifierSchema).optional(),
    // Only meaningful for `testType: 'api'`; optional so a hand-linked case (`qa link`) still
    // validates, while `runner-api` rejects an `api` case that has none.
    endpoints: z.array(TestCaseEndpointSchema).min(1).optional(),
    status: TestCaseStatusSchema,
    createdAt: IsoDateTimeSchema,
  })
  .superRefine((testCase, context) => {
    const expectations = [
      ...testCase.steps.flatMap((step, stepIndex) =>
        (step.expectations ?? []).map((expectation, index) => ({
          expectation,
          path: ['steps', stepIndex, 'expectations', index],
        })),
      ),
      ...(testCase.resultExpectations ?? []).map((expectation, index) => ({
        expectation,
        path: ['resultExpectations', index],
      })),
    ];
    for (const { expectation, path } of expectations) {
      const message = findExpectationMismatch(testCase.testType, expectation.kind);
      if (message !== undefined) {
        context.addIssue({ code: 'custom', message, path });
      }
    }
  });
export type TestCase = z.infer<typeof TestCaseSchema>;
