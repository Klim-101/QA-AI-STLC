// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  TestCaseSchema,
  VerificationRecordSchema,
  type RelativePath,
  type ReviewAssertion,
  type TestCase,
  type VerificationRecord,
} from '@qa-ai-stlc/schemas';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { hashBytes } from '../hash.js';
import { LOCATOR_MODULE_PATH, parseLocatorModuleExports } from '../locator-module-exports.js';
import type { ManifestStore } from '../manifest-store.js';
import { assertRelativePath, resolveRelativePath } from '../paths.js';
import type { QaStore } from '../qa-store.js';
import { analyzeSpecAssertions, collectGroundingStrings } from '../spec-assertions.js';
import { extractSpecTestCaseIds } from '../spec-case-ids.js';
import { findCasePath } from './cases-render.js';
import { findLatestProvenSession } from './proven-session.js';

export interface LoadedReviewSpec {
  readonly testCase: TestCase;
  readonly specPath: RelativePath;
  readonly specContent: string;
  readonly specSha256: string;
  readonly hasProvenSession: boolean;
  readonly assertions: readonly ReviewAssertion[];
  readonly verification?: VerificationRecord;
}

/**
 * Reads what a review is about, from registered artifacts only: the case, the spec as the engine
 * registered it (refused when it is missing, never registered or edited since) and the case's
 * proven session, and analyses the spec's assertions. The author's reasoning is not read: the
 * engine has no path to it.
 */
export async function loadReviewSpec(
  context: EngineContext,
  store: QaStore,
  manifest: ManifestStore,
  testCaseId: string,
  specPathInput: string,
): Promise<LoadedReviewSpec> {
  const testCase = await store.readJson(await findCasePath(store, testCaseId), TestCaseSchema);
  const specPath = assertRelativePath(specPathInput);
  const absolutePath = resolveRelativePath(context.projectRoot, specPath);
  if (!(await context.fs.pathExists(absolutePath))) {
    throw new QaError('REVIEW_SPEC_NOT_FOUND', `"${specPath}" does not exist`, {
      remediation: 'Pass the project-relative path the spec was registered under (qa.generation_register).',
    });
  }
  const bytes = await context.fs.readBytes(absolutePath);
  if (!(await manifest.verifyContent(specPath, bytes))) {
    throw new QaError(
      'REVIEW_SPEC_NOT_REGISTERED',
      `"${specPath}" is not registered, or changed after it was`,
      {
        remediation:
          'Review only a spec the engine registered; a spec edited since has to be verified and registered again.',
      },
    );
  }
  const specContent = Buffer.from(bytes).toString('utf-8');
  if (!extractSpecTestCaseIds(specContent).includes(testCaseId)) {
    throw new QaError('REVIEW_SPEC_CASE_MISMATCH', `"${specPath}" is not a spec of case "${testCaseId}"`, {
      remediation: 'Pass the spec generated for this case: its testCaseId annotation names it.',
    });
  }

  const provenSession = await findLatestProvenSession(context, testCase, { testCaseId });
  const moduleSource = resolveRelativePath(context.projectRoot, LOCATOR_MODULE_PATH);
  const locatorNames = (await context.fs.pathExists(moduleSource))
    ? new Set(parseLocatorModuleExports(await context.fs.readFile(moduleSource)).map((entry) => entry.name))
    : undefined;
  const assertions = analyzeSpecAssertions(specContent, {
    ...(locatorNames === undefined ? {} : { locatorNames }),
    groundingCorpus: collectGroundingStrings(testCase, provenSession),
  });
  const verification = await findRegisteringVerification(store, specPath, hashBytes(bytes));
  return {
    testCase,
    specPath,
    specContent,
    specSha256: hashBytes(bytes),
    hasProvenSession: provenSession !== undefined,
    assertions,
    ...(verification === undefined ? {} : { verification }),
  };
}

// The record of the verification that authorized this very content's registration, the latest one.
async function findRegisteringVerification(
  store: QaStore,
  specPath: RelativePath,
  contentSha256: string,
): Promise<VerificationRecord | undefined> {
  const paths = (await store.listFiles('verifications')).filter((path) => path.endsWith('.json'));
  const records = await Promise.all(paths.map((path) => store.readJson(path, VerificationRecordSchema)));
  return records
    .filter(
      (record) =>
        record.filePath === specPath &&
        record.contentSha256 === contentSha256 &&
        record.status === 'verified' &&
        record.consumedAt !== undefined,
    )
    .toSorted((a, b) => new Date(b.verifiedAt).getTime() - new Date(a.verifiedAt).getTime())[0];
}
