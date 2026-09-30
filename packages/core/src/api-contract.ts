// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { ApiContractSlice, Config, EnvironmentConfig, TestCaseEndpoint } from '@qa-ai-stlc/schemas';
import { isUrlAllowed } from './browser-allowlist.js';
import type { EngineContext } from './engine-context.js';
import { QaError } from './errors.js';
import { hashText } from './hash.js';
import { toCanonicalJson } from './json-file.js';
import { ManifestStore } from './manifest-store.js';
import { discoverOpenApiContract } from './openapi-discovery.js';
import { comparableApiPath, listOpenApiOperations, parseOpenApiDocument } from './openapi-endpoints.js';
import { resolveBrowserEnvironment } from './operations/browser-open.js';
import { resolveRelativePath } from './paths.js';
import { QaStore } from './qa-store.js';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_OPERATION_DEFINITION_CHARS = 8000;
const CONTRACT_SNAPSHOT_PATH = 'artifacts/api-contract.txt';

export interface ApiContract {
  /** A project-relative path or an absolute URL. */
  readonly source: string;
  readonly text: string;
  readonly sha256: string;
  readonly document: Record<string, unknown>;
}

function isUrl(source: string): boolean {
  return /^https?:\/\//iu.test(source);
}

async function fetchContractText(
  context: EngineContext,
  source: string,
  environment: EnvironmentConfig,
): Promise<string> {
  if (!isUrlAllowed(source, environment.allowlist, environment.baseUrl)) {
    throw new QaError('API_CONTRACT_URL_NOT_ALLOWED', `api.source is not on the allowlist: ${source}`, {
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
    throw new QaError('API_CONTRACT_UNREADABLE', `${source} answered ${String(response.status)}`, {
      remediation: 'Check api.source is reachable without a redirect.',
    });
  }
  return response.bodyText;
}

async function readContractFile(context: EngineContext, source: string): Promise<string> {
  try {
    return await context.fs.readFile(resolveRelativePath(context.projectRoot, source));
  } catch (error) {
    throw new QaError('API_CONTRACT_UNREADABLE', `Cannot read the contract at ${source}`, {
      remediation: 'Check api.source points at an existing file inside the project.',
      cause: error,
    });
  }
}

/**
 * Loads the OpenAPI 3.x contract `config.api.source` names: a project file, a URL on the
 * environment's allowlist (scheme and port included) or, for `discover`, the first well-known spec
 * path that serves one. The SHA-256 is computed over the exact text that is parsed, so a later
 * comparison reads back what this call saw (AGENTS.md 12.7). A `synthesize` source is not a
 * contract until an operator approves the draft, so it is rejected here.
 */
export async function loadApiContract(
  context: EngineContext,
  config: Config,
  environmentName: string | undefined,
): Promise<ApiContract> {
  if (config.api === undefined) {
    throw new QaError('API_CONTRACT_NOT_CONFIGURED', 'config.yaml has no "api" block', {
      remediation: 'Set api.source to a contract file, a URL or "discover" (qa config set).',
    });
  }
  const { source } = config.api;
  const environment = resolveBrowserEnvironment(config, environmentName).config;

  if (source === 'synthesize') {
    throw new QaError(
      'API_CONTRACT_SYNTHESIZE_UNSUPPORTED',
      'api.source is "synthesize": a synthesized draft is not a contract',
      { remediation: 'Approve a synthesized draft as the contract, or point api.source at a real one.' },
    );
  }

  let resolvedSource = source;
  let text: string;
  if (source === 'discover') {
    const found = await discoverOpenApiContract({
      baseUrl: environment.baseUrl,
      allowlist: environment.allowlist,
      httpClient: context.httpClient,
      ...(environment.tlsInsecure === true ? { tlsInsecure: true } : {}),
    });
    if (found === undefined) {
      throw new QaError('API_CONTRACT_DISCOVERY_FAILED', 'No OpenAPI 3.x document found at the known paths', {
        remediation: 'Set api.source to the contract file or URL.',
      });
    }
    resolvedSource = found.url;
    text = found.text;
  } else {
    text = isUrl(source)
      ? await fetchContractText(context, source, environment)
      : await readContractFile(context, source);
  }

  const document = parseOpenApiDocument(text);
  if (document === undefined) {
    throw new QaError('API_CONTRACT_NOT_OPENAPI', `${resolvedSource} is not an OpenAPI 3.x document`, {
      remediation: 'v1 supports OpenAPI 3.x in JSON or YAML only.',
    });
  }
  return { source: resolvedSource, text, sha256: hashText(text), document };
}

/**
 * Stores the contract text a run was checked against and registers it in the manifest, so the
 * SHA-256 a run's results relied on is on record and tamper-checked like any other artifact.
 */
export async function snapshotApiContract(context: EngineContext, contract: ApiContract): Promise<void> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  await store.writeText(CONTRACT_SNAPSHOT_PATH, contract.text);
  await manifest.register(CONTRACT_SNAPSHOT_PATH, contract.text);
}

/**
 * Narrows a contract to the operations a case names, for a spec-generating spoke. Matching ignores
 * path parameter names, as everywhere else; an operation the contract lacks fails loudly instead of
 * being dropped, because a slice that silently omits one would let a spoke invent it.
 */
export function selectContractOperations(
  contract: ApiContract,
  endpoints: readonly TestCaseEndpoint[],
): ApiContractSlice {
  const declared = listOpenApiOperations(contract.document);
  const missing: string[] = [];
  const operations: ApiContractSlice['operations'] = endpoints.flatMap((endpoint) => {
    const match = declared.find(
      ({ endpoint: candidate }) =>
        candidate.method === endpoint.method &&
        comparableApiPath(candidate.path) === comparableApiPath(endpoint.path),
    );
    if (match === undefined) {
      missing.push(`${endpoint.method} ${endpoint.path}`);
      return [];
    }
    // Canonical key order keeps the slice, and so sourceHash, deterministic; compact keeps a
    // spoke's context small.
    const definition = JSON.stringify(JSON.parse(toCanonicalJson(match.definition)));
    const truncated = definition.length > MAX_OPERATION_DEFINITION_CHARS;
    return [
      {
        method: match.endpoint.method,
        path: match.endpoint.path,
        ...(match.endpoint.operationId === undefined ? {} : { operationId: match.endpoint.operationId }),
        definition: truncated ? definition.slice(0, MAX_OPERATION_DEFINITION_CHARS) : definition,
        truncated,
      },
    ];
  });
  if (missing.length > 0) {
    throw new QaError(
      'API_CASE_NOT_IN_CONTRACT',
      `The contract (${contract.source}) has no operation for: ${missing.join(', ')}.`,
      { remediation: "Fix the case's endpoints, or add the operation to the contract." },
    );
  }
  return { source: contract.source, sha256: contract.sha256, operations };
}

// Plain string search, not a capturing regex: `noUncheckedIndexedAccess` would type a capture group
// `string | undefined` even though the pattern guarantees it (the same reasoning
// `parseGeneratorVersion` documents).
const CONTRACT_SHA256_PREFIX = 'export const CONTRACT_SHA256 = "';

/** The contract hash a generated `api` spec declares it was written against, if it declares one. */
export function extractContractSha256(specSource: string): string | undefined {
  const prefixIndex = specSource.indexOf(CONTRACT_SHA256_PREFIX);
  if (prefixIndex === -1) {
    return undefined;
  }
  const valueStart = prefixIndex + CONTRACT_SHA256_PREFIX.length;
  const valueEnd = specSource.indexOf('"', valueStart);
  return valueEnd === -1 ? undefined : specSource.slice(valueStart, valueEnd);
}
