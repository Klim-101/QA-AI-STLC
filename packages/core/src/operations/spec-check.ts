// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { SCHEMA_VERSION, type SpecCheckSummary } from '@qa-ai-stlc/schemas';
import type { EngineContext } from '../engine-context.js';
import { wrapUntrustedEvidenceText } from '../untrusted-evidence-text.js';
import { executeRunner, zeroedCounts, type RunOptions } from './run.js';

const MAX_FAILURE_MESSAGE_CHARS = 800;

/**
 * `qa spec check` / MCP `qa.spec_check` (P4-18): runs a spec set through its runner and says what
 * each test did, writing nothing. No run record, no result file, no evidence and no manifest entry
 * is made, so a check, unlike `qa run`, cannot change `qa report` or the history flaky detection
 * and triage read. For an engine-side question about a spec (does it still pass) that is not itself
 * a result the operator asked for, such as an independent review.
 */
export async function runSpecCheck(context: EngineContext, options: RunOptions): Promise<SpecCheckSummary> {
  const { outcomes } = await executeRunner(context, options);
  const counts = zeroedCounts();
  const results = outcomes.map(({ result }) => {
    counts[result.status] += 1;
    return {
      testCaseId: result.testCaseId,
      status: result.status,
      ...(result.failure === undefined
        ? {}
        : {
            failureMessage: wrapUntrustedEvidenceText(result.failure.message, MAX_FAILURE_MESSAGE_CHARS).text,
          }),
      ...(result.missingStepIds === undefined ? {} : { missingStepIds: [...result.missingStepIds] }),
    };
  });
  return { schemaVersion: SCHEMA_VERSION, counts, results };
}
