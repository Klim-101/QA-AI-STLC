// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { createApiAuthTokenCache, runHttpExecute } from '@qa-ai-stlc/core';
import { EvidenceSchema, StepIdSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import type { ToolDefinition } from '../tool.js';
import type { BrowserToolDependencies } from './browser-dependencies.js';

const InputSchema = z.object({
  runId: z.string().describe("The run id to register this call's evidence under."),
  environment: z
    .string()
    .optional()
    .describe('Environment name from config.yaml. Required when there is more than one.'),
  url: z.string().describe("The URL to call. Must be on the resolved environment's domain allowlist."),
  method: z.string().optional().describe('HTTP method. Defaults to GET.'),
  caseId: z
    .string()
    .optional()
    .describe(
      'The id of the case being executed. Required for any method other than GET, HEAD, OPTIONS or QUERY, and refused with EXECUTION_CASE_NOT_APPROVED until the operator approves the cases gate (ADR-0009).',
    ),
  headers: z
    .record(z.string(), z.string())
    .optional()
    .describe(
      'Extra request headers. Never put a credential here: an Authorization or Cookie header, or any header an apiAuth profile declares, is rejected. Use auth instead.',
    ),
  auth: z
    .string()
    .optional()
    .describe(
      'Name of an apiAuth profile from config.yaml. The engine adds the credential itself; you never see or pass it. Defaults to the environment default profile, if it has one.',
    ),
  sessionId: z
    .string()
    .optional()
    .describe(
      'For an auth profile that reads its token from the browser: the id of an open, signed-in qa.browser_open session of the same environment. The engine reads the token itself; you never see it.',
    ),
  identity: z
    .string()
    .optional()
    .describe(
      'For a cookie or localStorage token profile: a configured identity whose saved storage state is read instead of a live session. Use sessionId for any other source.',
    ),
  body: z.string().optional(),
  stepId: StepIdSchema.optional().describe(
    "'step-<N>', N the case step's 1-based position this call performs, when executing a registered case.",
  ),
});

const OutputSchema = z.object({
  status: z.number(),
  evidence: EvidenceSchema,
});

/**
 * `qa.http_execute` (P3-14/P3-15): makes one real HTTP call for the "api" test type, no browser
 * involved, and registers the request/response as evidence. `url` is checked against the resolved
 * environment's domain allowlist first (#364) — the same unconditional check every `qa.browser_*`
 * tool applies — and a method other than a safe read (a real POST/PUT/DELETE) is
 * sent only for a case of an approved case set (ADR-0009). The response body is stored as a capped preview; the engine never decides pass
 * or fail — compare the status and body against the case's expected result yourself. There is
 * deliberately no TLS input: certificate validation follows the environment's `tlsInsecure` in
 * config.yaml only (ADR-011).
 */
export function createHttpExecuteTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof InputSchema, typeof OutputSchema> {
  // One cache for the life of this server (ADR-0012): an OAuth token is fetched once and reused,
  // while the engine context is rebuilt on every tool call.
  const authTokenCache = createApiAuthTokenCache();
  return {
    name: 'qa.http_execute',
    description:
      'Makes one real HTTP call to a URL on the ' +
      "resolved environment's domain allowlist, and registers the request/response as evidence, " +
      'for the "api" test type. A GET, HEAD, OPTIONS or QUERY needs no case; a POST, PUT, PATCH or DELETE needs caseId, the id of a case in the approved case set. Returns the status code only — compare it and the recorded ' +
      "evidence against the case's expected result yourself; the engine never decides pass or fail. " +
      'To call a protected API pass auth (an apiAuth profile name); credentials are never accepted in headers or the URL. ' +
      'A profile that reads its token from the browser also needs sessionId (an open, signed-in qa.browser_open session) or identity.',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    handler: (input) =>
      runHttpExecute(dependencies.createContext(), {
        sessions: dependencies.sessions,
        runId: input.runId,
        url: input.url,
        ...(input.environment !== undefined ? { environment: input.environment } : {}),
        ...(input.method !== undefined ? { method: input.method } : {}),
        ...(input.caseId !== undefined ? { caseId: input.caseId } : {}),
        ...(input.headers !== undefined ? { headers: input.headers } : {}),
        authTokenCache,
        ...(input.auth !== undefined ? { auth: input.auth } : {}),
        ...(input.sessionId !== undefined ? { browserSessionId: input.sessionId } : {}),
        ...(input.identity !== undefined ? { identity: input.identity } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.stepId !== undefined ? { stepId: input.stepId } : {}),
      }),
  };
}
