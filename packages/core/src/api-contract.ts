// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Config, EnvironmentConfig } from '@qa-ai-stlc/schemas';
import { isUrlAllowed } from './browser-allowlist.js';
import type { EngineContext } from './engine-context.js';
import { QaError } from './errors.js';
import { hashText } from './hash.js';
import { ManifestStore } from './manifest-store.js';
import { discoverOpenApiContract } from './openapi-discovery.js';
import { parseOpenApiDocument } from './openapi-endpoints.js';
import { resolveBrowserEnvironment } from './operations/browser-open.js';
import { resolveRelativePath } from './paths.js';
import { QaStore } from './qa-store.js';

const FETCH_TIMEOUT_MS = 10_000;
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
