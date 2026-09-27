// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { redactHar } from '@qa-ai-stlc/core';
import {
  ApiSurfaceSchema,
  HttpMethodSchema,
  SCHEMA_VERSION,
  type ApiEndpoint,
  type ApiSurface,
} from '@qa-ai-stlc/schemas';

const MAX_EXAMPLES_PER_ENDPOINT = 5;

const NUMERIC_SEGMENT = /^\d+$/u;
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
// A short alphabetic prefix followed by a numeric suffix (`t-1`, `u-42`) — the shape a database's
// own generated record id commonly takes, as opposed to a static route word (`new`, `users`) that
// never ends in a number. Matches the demo app's own task ids (`t-1`, `t-2`, ...).
const PREFIXED_NUMERIC_ID_SEGMENT = /^[a-z]+-\d+$/iu;

interface HarRequestEntry {
  readonly request?: { readonly method?: unknown; readonly url?: unknown };
}

function isIdSegment(segment: string): boolean {
  return (
    NUMERIC_SEGMENT.test(segment) || UUID_SEGMENT.test(segment) || PREFIXED_NUMERIC_ID_SEGMENT.test(segment)
  );
}

// Collapses an identifier segment (`/tasks/8213`, `/tasks/t-1`, a UUID) to `{id}` so repeat visits
// to the same route with different record ids are one endpoint, not one per id. Only the path is
// ever kept — the query string is dropped outright, which also means a value a redaction pass
// would otherwise have to hunt for in a query parameter (a token, a search term) never reaches the
// artifact at all.
function templatePath(pathname: string): string {
  return pathname
    .split('/')
    .map((segment) => (isIdSegment(segment) ? '{id}' : segment))
    .join('/');
}

function sortEndpoints(endpoints: readonly ApiEndpoint[]): ApiEndpoint[] {
  return [...endpoints].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

/**
 * Derives a discovered `ApiSurface` from a crawl's HAR-shaped request log: the log is redacted
 * (`@qa-ai-stlc/core`'s `redactHar`, development plan section 6.4) before anything is read from
 * it, then every request is collapsed onto a templated `{id}` path. Each endpoint keeps a capped
 * sample of the raw paths it was collapsed from, so "endpoints collapsed correctly" stays
 * verifiable instead of the originals being silently discarded (P6-01).
 */
export function buildApiSurface(requestLogHar: string, generatedAt: string): ApiSurface {
  const { content: redacted } = redactHar(requestLogHar);

  let entries: readonly HarRequestEntry[];
  try {
    const parsed = JSON.parse(redacted) as { readonly log?: { readonly entries?: unknown } };
    entries = Array.isArray(parsed.log?.entries) ? (parsed.log.entries as HarRequestEntry[]) : [];
  } catch {
    entries = [];
  }

  const byKey = new Map<
    string,
    { readonly method: ApiEndpoint['method']; readonly path: string; readonly examples: string[] }
  >();
  for (const entry of entries) {
    const method = HttpMethodSchema.safeParse(
      typeof entry.request?.method === 'string' ? entry.request.method.toUpperCase() : undefined,
    );
    const rawUrl = typeof entry.request?.url === 'string' ? entry.request.url : undefined;
    if (!method.success || rawUrl === undefined) {
      continue;
    }
    let pathname: string;
    try {
      pathname = new URL(rawUrl).pathname;
    } catch {
      continue;
    }

    const templated = templatePath(pathname);
    const key = `${method.data} ${templated}`;
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, { method: method.data, path: templated, examples: [pathname] });
    } else if (
      !existing.examples.includes(pathname) &&
      existing.examples.length < MAX_EXAMPLES_PER_ENDPOINT
    ) {
      existing.examples.push(pathname);
    }
  }

  const endpoints = sortEndpoints(
    [...byKey.values()].map(({ method, path, examples }) => ({
      method,
      path,
      source: 'discovered',
      examples,
    })),
  );

  return ApiSurfaceSchema.parse({ schemaVersion: SCHEMA_VERSION, generatedAt, endpoints });
}

function mergeExamples(
  previous: readonly string[] | undefined,
  fresh: readonly string[] | undefined,
): string[] {
  const merged = [...(previous ?? [])];
  for (const example of fresh ?? []) {
    if (!merged.includes(example) && merged.length < MAX_EXAMPLES_PER_ENDPOINT) {
      merged.push(example);
    }
  }
  return merged;
}

/**
 * Unions a freshly derived `ApiSurface` onto a previously stored one instead of overwriting it —
 * a session that discovers no traffic (pick mode's manual click-through has no request log at
 * all) must not erase endpoints an earlier crawl already found, mirroring how the selector
 * registry merges rather than replaces (`mergeSelectorRegistry`).
 */
export function mergeApiSurface(previous: ApiSurface, fresh: ApiSurface, generatedAt: string): ApiSurface {
  const byKey = new Map<string, ApiEndpoint>();
  for (const endpoint of previous.endpoints) {
    byKey.set(`${endpoint.method} ${endpoint.path}`, endpoint);
  }
  for (const endpoint of fresh.endpoints) {
    const key = `${endpoint.method} ${endpoint.path}`;
    const existing = byKey.get(key);
    byKey.set(key, {
      ...endpoint,
      examples: mergeExamples(existing?.examples, endpoint.examples),
    });
  }

  return ApiSurfaceSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    endpoints: sortEndpoints([...byKey.values()]),
  });
}
