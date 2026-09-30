// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  ManifestStore,
  QaError,
  QaStore,
  hashText,
  loadConfig,
  resolveRelativePath,
  toCanonicalJson,
  type EngineContext,
} from '@qa-ai-stlc/core';
import {
  ApiDiffReportSchema,
  ApiSurfaceSchema,
  SCHEMA_VERSION,
  type ApiDiffKind,
  type ApiDiffReport,
  type Config,
} from '@qa-ai-stlc/schemas';
import { isAllowedUrl } from '../allowlist.js';
import { diffApiSurface } from '../api-diff.js';
import { discoverOpenApiContract } from '../openapi-discovery.js';
import { listOpenApiEndpoints, parseOpenApiDocument } from '../openapi-endpoints.js';
import { resolveEnvironment } from './explore.js';

const ENDPOINTS_PATH = 'selectors/endpoints.json';
const API_DIFF_PATH = 'selectors/api-diff.json';
const FETCH_TIMEOUT_MS = 10_000;

export interface ApiDiffOptions {
  readonly environment?: string;
}

export interface ApiDiffSummary {
  readonly reportPath: string;
  readonly contractSource: string;
  readonly contractSha256: string;
  readonly counts: ApiDiffReport['counts'];
}

interface LoadedContract {
  readonly source: string;
  readonly text: string;
  readonly document: Record<string, unknown>;
}

function isUrl(source: string): boolean {
  return /^https?:\/\//iu.test(source);
}

async function loadContract(
  context: EngineContext,
  config: Config,
  environmentName: string | undefined,
): Promise<LoadedContract> {
  if (config.api === undefined) {
    throw new QaError('API_DIFF_NO_CONTRACT_CONFIG', 'config.yaml has no "api" block', {
      remediation: 'Set api.source to a contract file, a URL or "discover" (qa config set).',
    });
  }
  const { source } = config.api;
  const environment = resolveEnvironment(config, environmentName).config;

  if (source === 'synthesize') {
    throw new QaError(
      'API_DIFF_SYNTHESIZE_UNSUPPORTED',
      'api.source is "synthesize": a synthesized draft is not a contract to diff against',
      { remediation: 'Approve a synthesized draft as the contract, or point api.source at a real one.' },
    );
  }

  if (source === 'discover') {
    const found = await discoverOpenApiContract({
      baseUrl: environment.baseUrl,
      allowlist: environment.allowlist,
      httpClient: context.httpClient,
      ...(environment.tlsInsecure === true ? { tlsInsecure: true } : {}),
    });
    if (found === undefined) {
      throw new QaError('API_DIFF_DISCOVERY_FAILED', 'No OpenAPI 3.x document found at the known paths', {
        remediation: 'Set api.source to the contract file or URL.',
      });
    }
    return { source: found.url, text: found.text, document: found.document };
  }

  let text: string;
  if (isUrl(source)) {
    if (!isAllowedUrl(source, environment.allowlist)) {
      throw new QaError('API_DIFF_URL_NOT_ALLOWED', `api.source host is not on the allowlist: ${source}`, {
        remediation: 'Add the contract host to the environment allowlist, or use a local file.',
      });
    }
    const response = await context.httpClient.request(source, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      ...(environment.tlsInsecure === true ? { tlsInsecure: true } : {}),
    });
    if (!response.ok) {
      throw new QaError('API_DIFF_CONTRACT_UNREADABLE', `${source} answered ${String(response.status)}`, {
        remediation: 'Check api.source is reachable without a redirect.',
      });
    }
    text = response.bodyText;
  } else {
    try {
      text = await context.fs.readFile(resolveRelativePath(context.projectRoot, source));
    } catch (error) {
      throw new QaError('API_DIFF_CONTRACT_UNREADABLE', `Cannot read the contract at ${source}`, {
        remediation: 'Check api.source points at an existing file inside the project.',
        cause: error,
      });
    }
  }

  const document = parseOpenApiDocument(text);
  if (document === undefined) {
    throw new QaError('API_DIFF_NOT_OPENAPI', `${source} is not an OpenAPI 3.x document`, {
      remediation: 'v1 supports OpenAPI 3.x in JSON or YAML only.',
    });
  }
  return { source, text, document };
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
  const contract = await loadContract(context, config, options.environment);

  const findings = diffApiSurface(listOpenApiEndpoints(contract.document), observed);
  const report = ApiDiffReportSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    generatedAt: context.clock.now().toISOString(),
    contract: { source: contract.source, sha256: hashText(contract.text) },
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
