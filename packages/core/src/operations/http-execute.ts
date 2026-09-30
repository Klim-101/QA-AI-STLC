// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { HttpResponseDetails } from '../ports/http-client.js';
import { HttpRequestRecordSchema, type Evidence, type Identifier } from '@qa-ai-stlc/schemas';
import {
  assertNoCredentialInputs,
  collectSensitiveNames,
  createApiAuthTokenCache,
  resolveApiAuth,
  selectApiAuthProfileName,
  type ApiAuthTokenCache,
  type ResolvedApiAuth,
} from '../api-auth.js';
import { redactHeaderValues, redactUrl, scrubSecretValues } from '../api-auth-redaction.js';
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

export interface HttpExecuteOptions {
  readonly runId: Identifier;
  /** Environment name from config.yaml. Required only when the project defines more than one. */
  readonly environment?: string;
  readonly url: string;
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  /** An `apiAuth` profile name from config.yaml; the environment's default profile when omitted. */
  readonly auth?: string;
  /** Tokens shared across calls in one engine process; a call given none never reuses a token. */
  readonly authTokenCache?: ApiAuthTokenCache;
  readonly idGenerator?: IdGenerator;
  /** `'step-<N>'`, `N` the case step's 1-based position, during an interactive execution session (P3-15). */
  readonly stepId?: Identifier;
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
 *
 * A raw credential in `headers` or in the URL query is rejected (`HTTP_CREDENTIAL_INPUT_REJECTED`): the
 * credential must come from a profile, so it never crosses the tool boundary.
 *
 * A call authenticates through a named `apiAuth` profile, never through a credential the caller
 * supplies (ADR-0012). The profile is resolved only after `url` passed the allowlist, so a token is
 * never fetched for or sent to a host outside it, and redirects are not followed while a credential
 * is attached. Every resolved value, and every header and query-parameter name a profile declares,
 * is scrubbed from the stored record � the body before it is truncated, so a token cut by the
 * preview limit cannot survive as a fragment.
 *
 * Certificate validation follows the resolved environment's `tlsInsecure` only, never the caller
 * (ADR-011): like the allowlist, it is a boundary the operator configures, not one an agent can
 * relax per call.
 */
export async function runHttpExecute(
  context: EngineContext,
  options: HttpExecuteOptions,
): Promise<HttpExecuteResult> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const config = await loadConfig(context);
  const environment = resolveBrowserEnvironment(config, options.environment);
  assertUrlAllowed(options.url, environment.config.allowlist, environment.config.baseUrl);
  const sensitiveNames = collectSensitiveNames(config.apiAuth);
  assertNoCredentialInputs(options.url, options.headers, sensitiveNames);

  const isTlsInsecure = environment.config.tlsInsecure === true;
  if (isTlsInsecure) {
    context.logger.warn(`TLS certificate validation is disabled for environment "${environment.name}"`, {
      code: 'ENVIRONMENT_TLS_INSECURE',
      environment: environment.name,
    });
  }

  const tokenCache = options.authTokenCache ?? createApiAuthTokenCache();
  const profileName = selectApiAuthProfileName(config.apiAuth, environment.name, options.auth);
  const idGenerator = options.idGenerator ?? randomIdGenerator;
  const method = options.method ?? 'GET';

  const send = async (): Promise<{
    readonly auth: ResolvedApiAuth | undefined;
    readonly response: HttpResponseDetails;
  }> => {
    const auth =
      profileName === undefined
        ? undefined
        : await resolveApiAuth(context, {
            profileName,
            apiAuth: config.apiAuth,
            environment: environment.config,
            tokenCache,
          });
    const hasCredential = auth !== undefined && auth.profileType !== 'none';
    const response = await context.httpClient.request(withQueryParameters(options.url, auth), {
      method,
      ...(options.headers !== undefined || auth !== undefined
        ? { headers: mergeHeaders(options.headers, auth) }
        : {}),
      ...(options.body !== undefined ? { body: options.body } : {}),
      ...(isTlsInsecure ? { tlsInsecure: true } : {}),
      ...(hasCredential ? { redirect: 'manual' as const } : {}),
    });
    return { auth, response };
  };

  let attempt = await send();
  const usedCredentials = [...(attempt.auth?.secretValues ?? [])];
  // A cached token the server no longer accepts (expired early, revoked) is dropped and replaced
  // once. A token that was just fetched is never retried: a second 401 means the credentials are
  // wrong, not stale.
  if (attempt.response.status === 401 && attempt.auth?.isReused === true && profileName !== undefined) {
    tokenCache.delete(profileName);
    attempt = await send();
    usedCredentials.push(...(attempt.auth?.secretValues ?? []));
  }
  const { response } = attempt;

  const secretValues = [...usedCredentials, ...tokenCache.values()];
  const bodyPreviewMaxLength = config.evidence.httpBodyPreviewMaxLength;
  const scrubbedBody = scrubSecretValues(response.bodyText, secretValues);
  const truncated = scrubbedBody.length > bodyPreviewMaxLength;
  const record = HttpRequestRecordSchema.parse({
    type: 'http-request',
    ...(options.stepId !== undefined ? { stepId: options.stepId } : {}),
    method,
    url: redactUrl(options.url, sensitiveNames, secretValues),
    status: response.status,
    responseHeaders: redactHeaderValues(response.headers, sensitiveNames, secretValues),
    bodyPreview: scrubbedBody.slice(0, bodyPreviewMaxLength),
    truncated,
    at: context.clock.now().toISOString(),
  });

  const manifest = new ManifestStore({ store, clock: context.clock });
  const evidenceStore = new EvidenceStore({ store, manifest, clock: context.clock });
  const evidence = await registerEvidenceOrThrow(evidenceStore, {
    id: `evidence-${idGenerator.next()}`,
    runId: options.runId,
    kind: 'other',
    fileExtension: 'json',
    content: toCanonicalJson(record),
    ...(options.stepId !== undefined ? { stepId: options.stepId } : {}),
  });

  return { status: response.status, evidence };
}

function withQueryParameters(url: string, auth: ResolvedApiAuth | undefined): string {
  const entries = Object.entries(auth?.queryParameters ?? {});
  if (entries.length === 0) {
    return url;
  }
  const target = new URL(url);
  for (const [name, value] of entries) {
    target.searchParams.set(name, value);
  }
  return target.toString();
}

function mergeHeaders(
  callerHeaders: Readonly<Record<string, string>> | undefined,
  auth: ResolvedApiAuth | undefined,
): Record<string, string> {
  // A caller header that a profile also sets is rejected earlier, so the two never collide.
  return { ...callerHeaders, ...auth?.headers };
}
