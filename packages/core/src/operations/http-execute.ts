// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Evidence, Identifier } from '@qa-ai-stlc/schemas';
import { assertUrlAllowed } from '../browser-allowlist.js';
import { loadConfig } from '../config-loader.js';
import type { EngineContext } from '../engine-context.js';
import { EvidenceStore } from '../evidence-store.js';
import { registerEvidenceOrThrow } from './browser-evidence.js';
import { resolveBrowserEnvironment } from './browser-open.js';
import { toCanonicalJson } from '../json-file.js';
import { ManifestStore } from '../manifest-store.js';
import { randomIdGenerator, type IdGenerator } from '../ports/id-generator.js';
import { QaStore } from '../qa-store.js';

/** Response bodies longer than this are stored truncated, with `truncated: true` set. */
const BODY_PREVIEW_MAX_LENGTH = 4000;

export interface HttpExecuteOptions {
  readonly runId: Identifier;
  /** Environment name from config.yaml. Required only when the project defines more than one. */
  readonly environment?: string;
  readonly url: string;
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly tlsInsecure?: boolean;
  readonly idGenerator?: IdGenerator;
}

export interface HttpExecuteResult {
  readonly status: number;
  readonly evidence: Evidence;
}

/**
 * Makes one real HTTP call for the `api` test type (P3-14) and registers the request/response as
 * evidence — the same "an agent's action is only real if the engine recorded it" principle
 * ADR-005 already applies to browser actions, extended to the one network operation core already
 * has direct access to (`HttpClient.request`, no browser needed). The response body is stored as
 * a capped preview: `EvidenceStore.register`'s secret scan still covers the whole preview, but an
 * unbounded body should not blow up evidence storage on its own.
 *
 * `url` is checked against the resolved environment's domain allowlist first (#364), the same
 * unconditional check every `qa.browser_*` tool already applies — this only restricts which host
 * can be called, never which method: a real POST/PUT/DELETE against an allowed host is exactly
 * what proving the `api` test type actually works requires (ADR-0009's reasoning, applied here).
 */
export async function runHttpExecute(
  context: EngineContext,
  options: HttpExecuteOptions,
): Promise<HttpExecuteResult> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const config = await loadConfig(store);
  const environment = resolveBrowserEnvironment(config, options.environment);
  assertUrlAllowed(options.url, environment.config.allowlist, environment.config.baseUrl);

  const idGenerator = options.idGenerator ?? randomIdGenerator;
  const method = options.method ?? 'GET';
  const response = await context.httpClient.request(options.url, {
    method,
    ...(options.headers !== undefined ? { headers: options.headers } : {}),
    ...(options.body !== undefined ? { body: options.body } : {}),
    ...(options.tlsInsecure !== undefined ? { tlsInsecure: options.tlsInsecure } : {}),
  });

  const truncated = response.bodyText.length > BODY_PREVIEW_MAX_LENGTH;
  const record = {
    type: 'http-request' as const,
    method,
    url: options.url,
    status: response.status,
    responseHeaders: response.headers,
    bodyPreview: response.bodyText.slice(0, BODY_PREVIEW_MAX_LENGTH),
    truncated,
    at: context.clock.now().toISOString(),
  };

  const manifest = new ManifestStore({ store, clock: context.clock });
  const evidenceStore = new EvidenceStore({ store, manifest, clock: context.clock });
  const evidence = await registerEvidenceOrThrow(evidenceStore, {
    id: `evidence-${idGenerator.next()}`,
    runId: options.runId,
    kind: 'other',
    fileExtension: 'json',
    content: toCanonicalJson(record),
  });

  return { status: response.status, evidence };
}
