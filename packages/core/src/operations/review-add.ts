// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { ReviewSchema, type RelativePath, type Review } from '@qa-ai-stlc/schemas';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { readJsonFile, toCanonicalJson } from '../json-file.js';
import { ManifestStore } from '../manifest-store.js';
import { assertRelativePath, resolveRelativePath } from '../paths.js';
import { QaStore } from '../qa-store.js';
import { parseInlineContent } from '../schema-issues.js';
import { loadReviewSpec } from './review-spec.js';

export interface ReviewAddOptions {
  readonly path?: string;
  /** The review itself, instead of a file holding it; validated by `ReviewSchema` exactly like a file's content. */
  readonly review?: unknown;
}

export interface ReviewAddResult {
  readonly testCaseId: string;
  readonly verdict: Review['verdict'];
  readonly reviewPath: string;
}

function reviewAddUsageError(): QaError {
  return new QaError('REVIEW_ADD_USAGE', 'Usage: qa review add --path <path>', {
    remediation: 'Give exactly one of a file path (--path review.json) or an inline review.',
  });
}

async function readReview(context: EngineContext, options: ReviewAddOptions): Promise<Review> {
  if (options.review !== undefined) {
    if (options.path !== undefined) {
      throw reviewAddUsageError();
    }
    return parseInlineContent(ReviewSchema, options.review, { code: 'REVIEW_INVALID', subject: 'review' });
  }
  if (options.path === undefined) {
    throw reviewAddUsageError();
  }
  const path = assertRelativePath(options.path);
  const absolutePath = resolveRelativePath(context.projectRoot, path);
  if (!(await context.fs.pathExists(absolutePath))) {
    throw new QaError('REVIEW_ADD_FILE_NOT_FOUND', `"${path}" does not exist`, {
      remediation: 'Check --path points at a real, readable file relative to the project root.',
    });
  }
  return readJsonFile(context.fs, absolutePath, ReviewSchema);
}

/**
 * `qa review add` / MCP `qa.review_add` (P4-06): validates the reviewer spoke's verdict on a
 * generated spec and registers it under `artifacts/reviews/<case-id>.json`. The review is bound to
 * the spec's exact content. The engine will not let the verdict contradict what it found
 * (AGENTS.md 12.1): a spec with an `error` finding (a literal as the assertion's subject, a selector
 * written into the spec, a locator no registered element backs) cannot be approved, and approval
 * needs a reasoned waiver for every `warning`, for a finding the engine actually raises. Registering
 * again for the same case replaces the earlier review.
 */
export async function runReviewAdd(
  context: EngineContext,
  options: ReviewAddOptions,
): Promise<ReviewAddResult> {
  const review = await readReview(context, options);
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const loaded = await loadReviewSpec(context, store, manifest, review.testCaseId, review.specPath);
  if (loaded.specSha256 !== review.specSha256) {
    throw new QaError(
      'REVIEW_SPEC_CHANGED',
      `The review is of another version of "${review.specPath}" than the registered one`,
      {
        remediation: 'Review the spec as qa.review_input returns it now and quote its specSha256.',
      },
    );
  }

  const raised = loaded.assertions.flatMap((assertion) =>
    assertion.findings.map((finding) => ({ assertionId: assertion.id, ...finding })),
  );
  for (const waiver of review.waivers) {
    if (
      !raised.some((finding) => finding.assertionId === waiver.assertionId && finding.code === waiver.code)
    ) {
      throw new QaError(
        'REVIEW_WAIVER_UNKNOWN',
        `The waiver for ${waiver.assertionId} (${waiver.code}) answers a finding the engine does not raise`,
        { remediation: 'Waive only findings qa.review_input lists, by assertion id and code.' },
      );
    }
  }
  if (review.verdict === 'approved') {
    const errors = raised.filter((finding) => finding.severity === 'error');
    if (errors.length > 0) {
      throw new QaError(
        'REVIEW_APPROVAL_BLOCKED',
        `Approval is blocked by: ${errors.map((finding) => `${finding.assertionId} ${finding.code}`).join(', ')}`,
        { remediation: 'Reject the spec, naming these findings: an error finding cannot be waived.' },
      );
    }
    const unwaived = raised.filter(
      (finding) =>
        !review.waivers.some(
          (waiver) => waiver.assertionId === finding.assertionId && waiver.code === finding.code,
        ),
    );
    if (unwaived.length > 0) {
      throw new QaError(
        'REVIEW_WARNING_NOT_WAIVED',
        `Approval needs a reason for: ${unwaived.map((finding) => `${finding.assertionId} ${finding.code}`).join(', ')}`,
        { remediation: 'Add a waiver with the reason for each, or reject the spec.' },
      );
    }
  }

  const reviewPath: RelativePath = `artifacts/reviews/${review.testCaseId}.json`;
  const serialized = toCanonicalJson(review);
  await store.writeText(reviewPath, serialized);
  await manifest.register(reviewPath, serialized);
  return { testCaseId: review.testCaseId, verdict: review.verdict, reviewPath };
}
