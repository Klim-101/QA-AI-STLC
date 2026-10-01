// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  QaError,
  QaStore,
  comparableApiPath,
  extractContractSha256,
  extractSpecTestCaseIds,
  findCasePath,
  findCredentialInSpecSource,
  listOpenApiEndpoints,
  type ApiContract,
  type EngineContext,
  type SensitiveNames,
} from '@qa-ai-stlc/core';
import { TestCaseSchema } from '@qa-ai-stlc/schemas';

// Most specific first: a spec that is stale against the contract is reported as such even when it
// also has a structural problem.
const VIOLATION_CODES_BY_PRIORITY = [
  'HTTP_CREDENTIAL_INPUT_REJECTED',
  'API_CASE_NOT_IN_CONTRACT',
  'API_SPEC_CONTRACT_CHANGED',
  'API_CASE_INVALID',
] as const;
type ViolationCode = (typeof VIOLATION_CODES_BY_PRIORITY)[number];

interface Violation {
  readonly code: ViolationCode;
  readonly message: string;
}

/**
 * Rejects a spec set before it runs when any case it exercises is not backed by the contract
 * (P6-04): a spec must declare its case through a `testCaseId` annotation, that case must be an
 * `api` case that lists the operations it exercises, and every such operation must exist in the
 * contract (path parameter names aside). The check reads the registered case artifacts, never the
 * spec's own claims about its endpoints, so a spec cannot vouch for itself. A spec that carries a
 * credential of its own (a header or query parameter a profile owns, or a `Bearer` value) is rejected
 * too: it must authenticate through `apiAuth('<profile>')` (ADR-0012).
 */
export async function assertApiSpecsInContract(
  engine: EngineContext,
  specFiles: readonly string[],
  contract: ApiContract,
  sensitiveNames: SensitiveNames,
): Promise<void> {
  const store = new QaStore({ projectRoot: engine.projectRoot, fs: engine.fs });
  const contractOperations = new Set(
    listOpenApiEndpoints(contract.document).map(
      (endpoint) => `${endpoint.method} ${comparableApiPath(endpoint.path)}`,
    ),
  );
  const violations: Violation[] = [];

  for (const specFile of specFiles) {
    const specSource = await engine.fs.readFile(specFile);
    const stampedSha256 = extractContractSha256(specSource);
    if (stampedSha256 !== undefined && stampedSha256 !== contract.sha256) {
      violations.push({
        code: 'API_SPEC_CONTRACT_CHANGED',
        message: `${specFile} was generated against contract ${stampedSha256}, but ${contract.source} now hashes to ${contract.sha256}.`,
      });
    }
    const credential = findCredentialInSpecSource(specSource, sensitiveNames);
    if (credential !== undefined) {
      violations.push({
        code: 'HTTP_CREDENTIAL_INPUT_REJECTED',
        message: `${specFile} carries ${credential}.`,
      });
    }
    const caseIds = extractSpecTestCaseIds(specSource);
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

  if (violations.length > 0) {
    const code =
      VIOLATION_CODES_BY_PRIORITY.find((candidate) =>
        violations.some((violation) => violation.code === candidate),
      ) ?? 'API_CASE_INVALID';
    throw new QaError(code, violations.map((violation) => violation.message).join('\n'), {
      remediation:
        'API cases come from the configured contract only: fix the endpoints the case lists, add the operation to the contract, or regenerate a spec stamped with an old contract hash. Authenticate with apiAuth(profile) from tests/qa/api-auth.ts, never a header, token or key written into the spec.',
    });
  }
}
