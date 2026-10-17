// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { SCHEMA_VERSION, type ReviewInput } from '@qa-ai-stlc/schemas';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { ManifestStore } from '../manifest-store.js';
import { QaStore } from '../qa-store.js';
import { loadReviewSpec } from './review-spec.js';

const MAX_SPEC_CHARS = 30_000;

export interface ReviewInputOptions {
  readonly testCaseId?: string;
  readonly specPath?: string;
}

/**
 * `qa.review_input` (P4-06): what the reviewer spoke works from, built by the engine from
 * registered artifacts only: the case, the spec as registered, the verification that let it be
 * registered, and per assertion what the engine found (a literal as subject, a selector written into
 * the spec, a locator no registered element backs, an expected value neither the case nor the
 * proven session contains). The author's reasoning is not part of it: the reviewer judges the
 * output, not the argument for it.
 */
export async function runReviewInput(
  context: EngineContext,
  options: ReviewInputOptions,
): Promise<ReviewInput> {
  if (options.testCaseId === undefined || options.specPath === undefined) {
    throw new QaError('REVIEW_INPUT_USAGE', 'Usage: qa.review_input with a test case id and a spec path', {
      remediation: 'Pass the case id and the project-relative path the spec was registered under.',
    });
  }
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const loaded = await loadReviewSpec(context, store, manifest, options.testCaseId, options.specPath);
  const isTruncated = loaded.specContent.length > MAX_SPEC_CHARS;
  return {
    schemaVersion: SCHEMA_VERSION,
    testCaseId: loaded.testCase.id,
    specPath: loaded.specPath,
    specSha256: loaded.specSha256,
    case: {
      title: loaded.testCase.title,
      steps: loaded.testCase.steps.map((step) => step.description),
      expectedResult: loaded.testCase.expectedResult,
    },
    specContent: isTruncated ? loaded.specContent.slice(0, MAX_SPEC_CHARS) : loaded.specContent,
    isSpecTruncated: isTruncated,
    ...(loaded.verification === undefined
      ? {}
      : {
          verification: {
            id: loaded.verification.id,
            status: loaded.verification.status,
            ...(loaded.verification.result === undefined
              ? {}
              : { resultStatus: loaded.verification.result.status }),
          },
        }),
    hasProvenSession: loaded.hasProvenSession,
    assertions: [...loaded.assertions],
  };
}
