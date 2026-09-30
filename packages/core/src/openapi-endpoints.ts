// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { HttpMethodSchema, type ApiEndpoint } from '@qa-ai-stlc/schemas';
import { parse as parseYaml } from 'yaml';
import { QaError } from './errors.js';

const OPENAPI_VERSION = /^3\.\d+(\.\d+)?/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses a document as JSON or YAML and returns it only when it declares an OpenAPI 3.x version;
 * anything else (an HTML error page served with a 200, a Swagger 2.0 document) is `undefined`, so
 * a probe can tell "not a contract" from "a broken contract".
 */
export function parseOpenApiDocument(text: string): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || typeof parsed.openapi !== 'string' || !OPENAPI_VERSION.test(parsed.openapi)) {
    return undefined;
  }
  return parsed;
}

/**
 * Lists the operations a contract declares as `openapi` endpoints. Paths keep the contract's own
 * parameter names; comparison with observed traffic is name-insensitive (`api-diff.ts`).
 */
export function listOpenApiEndpoints(document: Record<string, unknown>): ApiEndpoint[] {
  const paths = document.paths;
  if (!isRecord(paths)) {
    throw new QaError('OPENAPI_NO_PATHS', 'The OpenAPI document has no "paths" object', {
      remediation: 'Supply a contract that declares at least one path.',
    });
  }
  const endpoints: ApiEndpoint[] = [];
  for (const [path, item] of Object.entries(paths)) {
    if (!isRecord(item)) {
      continue;
    }
    for (const [key, operation] of Object.entries(item)) {
      const method = HttpMethodSchema.safeParse(key.toUpperCase());
      if (!method.success || !isRecord(operation)) {
        continue;
      }
      const operationId = operation.operationId;
      endpoints.push({
        method: method.data,
        path,
        source: 'openapi',
        ...(typeof operationId === 'string' && operationId !== '' ? { operationId } : {}),
      });
    }
  }
  return endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

/**
 * Collapses every `{...}` path parameter to `{}`, so a contract's `/tasks/{taskId}` and an
 * observed or case-declared `/tasks/{id}` compare equal: parameter names are not part of an
 * operation's identity.
 */
export function comparableApiPath(path: string): string {
  return path.replace(/[{][^}/]*[}]/gu, '{}');
}
