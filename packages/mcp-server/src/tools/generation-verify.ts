// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError, stampGeneratedTestSpec, verifyGeneratedTestSpec, type Runner } from '@qa-ai-stlc/core';
import { apiRunner } from '@qa-ai-stlc/runner-api';
import { playwrightRunner } from '@qa-ai-stlc/runner-playwright';
import {
  GeneratedTestSpecSchema,
  GenerationSpokeInputSchema,
  RelativePathSchema,
  RunResultSchema,
  SpokeValidationIssueSchema,
  VerificationIdSchema,
  type TestType,
} from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

// `e2e` and `api` have runners today (`@qa-ai-stlc/runner-playwright`, P3-01; `@qa-ai-stlc/runner-api`,
// P6-04); the `a11y` runner is a later Phase 6 task. Keyed by `TestType` so a future runner is one entry, not a new dispatch
// shape — the same table `qa.run`/`qa run` each keep their own copy of.
const RUNNERS_BY_TEST_TYPE: Partial<Record<TestType, Runner>> = {
  e2e: playwrightRunner,
  api: apiRunner,
};

function resolveRunner(testType: TestType): Runner {
  const runner = RUNNERS_BY_TEST_TYPE[testType];
  if (runner === undefined) {
    throw new QaError('RUN_TEST_TYPE_UNSUPPORTED', `No runner is available yet for test type "${testType}"`, {
      remediation: `Use one of: ${Object.keys(RUNNERS_BY_TEST_TYPE).join(', ')}.`,
    });
  }
  return runner;
}

const InputSchema = z.object({
  input: GenerationSpokeInputSchema.describe(
    'The exact spoke input the candidate content was generated from (qa.generation_spoke_input).',
  ),
  content: z.string().min(1).describe("The candidate generated spec's full source."),
  filePath: RelativePathSchema.describe('Where this spec will be registered once verified.'),
  generatorVersion: z
    .string()
    .min(1)
    .describe('Stamped alongside the spec; must match the GENERATOR_VERSION the content itself exports.'),
  environment: z
    .string()
    .optional()
    .describe('Environment name from config.yaml. Required when there is more than one.'),
});

const OutputSchema = z.object({
  status: z.enum(['typecheck_failed', 'execution_failed', 'verified']),
  verificationId: VerificationIdSchema.describe(
    'The engine\'s record of this verification. For "verified", pass it to qa.generation_register.',
  ),
  issues: z
    .array(SpokeValidationIssueSchema)
    .optional()
    .describe(
      'Present for "typecheck_failed"/"execution_failed" — what to fix and re-dispatch the generating spoke with.',
    ),
  result: RunResultSchema.optional().describe(
    'Present for "execution_failed"/"verified" — the execution this outcome is based on.',
  ),
  spec: GeneratedTestSpecSchema.optional().describe(
    'Present only for "verified" — pass this exact object, unmodified, to qa.generation_register.',
  ),
});

/**
 * `qa.generation_verify` (P3-06/P3-07): a generated spec is never registered on trust. Stamps
 * `content` into a `GeneratedTestSpec` (binding it to the exact `input` it was generated from,
 * `sourceHash`), typechecks it, and — only if that passes — executes it once through the runner for
 * `input.testCase.testType`, against a scratch copy that never touches the real project tree. Only a
 * `'verified'` outcome should ever reach `qa.generation_register`; report `issues` from the other two
 * outcomes back to the generating spoke instead.
 */
export const generationVerifyTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.generation_verify',
  description:
    'Typechecks a candidate generated spec and, only if that passes, executes it once through the ' +
    'real runner against a scratch copy that never touches the real project tree. Returns ' +
    '"typecheck_failed"/"execution_failed" with issues to fix, or "verified" with a spec and ' +
    'verificationId to pass, unmodified, to qa.generation_register. An api spec must declare the ' +
    'contract hash from the input (export const CONTRACT_SHA256) and is rejected once the live ' +
    'contract hashes differently. The test case must be registered ' +
    'and unchanged since qa.generation_spoke_input built the input.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler(input) {
    const context = createNodeEngineContext();
    const spec = stampGeneratedTestSpec({
      input: input.input,
      content: input.content,
      filePath: input.filePath,
      generatorVersion: input.generatorVersion,
      clock: context.clock,
    });
    const runner = resolveRunner(input.input.testCase.testType);
    const outcome = await verifyGeneratedTestSpec(context, {
      spec,
      testCase: input.input.testCase,
      runner,
      ...(input.input.apiContract !== undefined ? { contractSha256: input.input.apiContract.sha256 } : {}),
      ...(input.environment !== undefined ? { environment: input.environment } : {}),
    });

    const { verificationId } = outcome;
    if (outcome.status === 'typecheck_failed') {
      return { status: outcome.status, verificationId, issues: [...outcome.issues] };
    }
    if (outcome.status === 'execution_failed') {
      return { status: outcome.status, verificationId, issues: [...outcome.issues], result: outcome.result };
    }
    return { status: outcome.status, verificationId, spec, result: outcome.result };
  },
};
