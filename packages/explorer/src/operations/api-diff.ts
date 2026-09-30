// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  ManifestStore,
  QaError,
  QaStore,
  listOpenApiEndpoints,
  loadApiContract,
  loadConfig,
  toCanonicalJson,
  type EngineContext,
} from '@qa-ai-stlc/core';
import {
  ApiDiffReportSchema,
  ApiSurfaceSchema,
  SCHEMA_VERSION,
  type ApiDiffKind,
  type ApiDiffReport,
} from '@qa-ai-stlc/schemas';
import { diffApiSurface } from '../api-diff.js';

const ENDPOINTS_PATH = 'selectors/endpoints.json';
const API_DIFF_PATH = 'selectors/api-diff.json';

export interface ApiDiffOptions {
  readonly environment?: string;
}

export interface ApiDiffSummary {
  readonly reportPath: string;
  readonly contractSource: string;
  readonly contractSha256: string;
  readonly counts: ApiDiffReport['counts'];
}

function countKind(findings: ApiDiffReport['findings'], kind: ApiDiffKind): number {
  return findings.filter((finding) => finding.kind === kind).length;
}

/**
 * `qa api-diff` / MCP `qa.api_diff` (P6-02): compares the configured OpenAPI contract with the
 * endpoints the last `qa explore` observed and stores the classified discrepancies. The contract
 * SHA-256 is recorded so a later consumer can tell which contract a report describes.
 */
export async function runApiDiff(
  context: EngineContext,
  options: ApiDiffOptions = {},
): Promise<ApiDiffSummary> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const config = await loadConfig(context);

  if (!(await store.pathExists(ENDPOINTS_PATH))) {
    throw new QaError('API_DIFF_NO_ENDPOINTS', 'No discovered endpoints to diff', {
      remediation: 'Run "qa explore" first to capture the application\'s API traffic.',
    });
  }
  const observed = await store.readJson(ENDPOINTS_PATH, ApiSurfaceSchema);
  const contract = await loadApiContract(context, config, options.environment);

  const findings = diffApiSurface(listOpenApiEndpoints(contract.document), observed);
  const report = ApiDiffReportSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    generatedAt: context.clock.now().toISOString(),
    contract: { source: contract.source, sha256: contract.sha256 },
    counts: {
      matched: countKind(findings, 'matched'),
      undocumented: countKind(findings, 'undocumented'),
      methodNotDocumented: countKind(findings, 'method-not-documented'),
      unobserved: countKind(findings, 'unobserved'),
    },
    findings,
  });

  const serialized = toCanonicalJson(report);
  await store.writeText(API_DIFF_PATH, serialized);
  await manifest.register(API_DIFF_PATH, serialized);

  return {
    reportPath: API_DIFF_PATH,
    contractSource: report.contract.source,
    contractSha256: report.contract.sha256,
    counts: report.counts,
  };
}
