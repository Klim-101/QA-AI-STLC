// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  QaError,
  QaStore,
  comparableApiPath,
  extractSpecTestCaseIds,
  findCasePath,
  listOpenApiEndpoints,
  type ApiContract,
  type EngineContext,
} from '@qa-ai-stlc/core';
import { TestCaseSchema } from '@qa-ai-stlc/schemas';

interface Violation {
  readonly code: 'API_CASE_INVALID' | 'API_CASE_NOT_IN_CONTRACT';
  readonly message: string;
}

/**
 * Rejects a spec set before it runs when any case it exercises is not backed by the contract
 * (P6-04): a spec must declare its case through a `testCaseId` annotation, that case must be an
 * `api` case that lists the operations it exercises, and every such operation must exist in the
 * contract (path parameter names aside). The check reads the registered case artifacts, never the
 * spec's own claims about its endpoints, so a spec cannot vouch for itself.
 */
export async function assertApiSpecsInContract(
  engine: EngineContext,
  specFiles: readonly string[],
  contract: ApiContract,
): Promise<void> {
  const store = new QaStore({ projectRoot: engine.projectRoot, fs: engine.fs });
  const contractOperations = new Set(
    listOpenApiEndpoints(contract.document).map(
      (endpoint) => `${endpoint.method} ${comparableApiPath(endpoint.path)}`,
    ),
  );
  const violations: Violation[] = [];

  for (const specFile of specFiles) {
    const caseIds = extractSpecTestCaseIds(await engine.fs.readFile(specFile));
    if (caseIds.length === 0) {
      violations.push({
        code: 'API_CASE_INVALID',
        message: `${specFile} declares no "testCaseId" annotation, so no case backs it.`,
      });
    }
    for (const caseId of caseIds) {
      const testCase = await store.readJson(await findCasePath(store, caseId), TestCaseSchema);
      if (testCase.testType !== 'api') {
        violations.push({
          code: 'API_CASE_INVALID',
          message: `Case "${caseId}" is a "${testCase.testType}" case, not an "api" case.`,
        });
      } else if (testCase.endpoints === undefined) {
        violations.push({
          code: 'API_CASE_INVALID',
          message: `Case "${caseId}" lists no "endpoints", so it cannot be checked against the contract.`,
        });
      } else {
        for (const endpoint of testCase.endpoints) {
          if (!contractOperations.has(`${endpoint.method} ${comparableApiPath(endpoint.path)}`)) {
            violations.push({
              code: 'API_CASE_NOT_IN_CONTRACT',
              message: `Case "${caseId}" targets ${endpoint.method} ${endpoint.path}, which is not in the contract (${contract.source}).`,
            });
          }
        }
      }
    }
  }

  const [first] = violations;
  if (first !== undefined) {
    const code = violations.some((violation) => violation.code === 'API_CASE_NOT_IN_CONTRACT')
      ? 'API_CASE_NOT_IN_CONTRACT'
      : first.code;
    throw new QaError(code, violations.map((violation) => violation.message).join('\n'), {
      remediation:
        'API cases come from the configured contract only: fix the endpoints the case lists, or add the operation to the contract.',
    });
  }
}
