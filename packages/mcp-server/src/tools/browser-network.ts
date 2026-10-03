// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { MAX_LOG_READ_LIMIT, runBrowserNetwork } from '@qa-ai-stlc/core';
import { EvidenceSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import {
  SessionIdInputSchema,
  toBrowserOperationContext,
  type BrowserToolDependencies,
} from './browser-dependencies.js';
import { LOG_READ_INPUT_FIELDS } from './browser-console.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = SessionIdInputSchema.extend({
  ...LOG_READ_INPUT_FIELDS,
  errorsOnly: z
    .boolean()
    .optional()
    .describe('Only requests that failed before a response or got a status of 400 or more.'),
});

const OutputSchema = z.object({
  sessionId: z.string(),
  entries: z.array(
    z.object({
      seq: z.number().int(),
      tabId: z.string(),
      method: z.string(),
      status: z.number().int().optional().describe('Present when a response arrived.'),
      failure: z
        .string()
        .optional()
        .describe('Present when the request failed before a response, including one safe mode blocked.'),
      url: z
        .string()
        .describe(
          'Origin, path with identifiers templated as :id, and the names of query parameters; never values.',
        ),
    }),
  ),
  omittedCount: z.number().int().describe('Matching entries not returned because of `limit`.'),
  missedCount: z.number().int().describe('Events already dropped because the session log was full.'),
  cursor: z.number().int().describe('Pass as `since` to read on from here.'),
  evidence: EvidenceSchema,
});

/** `qa.browser_network` (P6-61): the requests the session's pages made, without headers, cookies or bodies. */
export function createBrowserNetworkTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof InputSchema, typeof OutputSchema> {
  return {
    name: 'qa.browser_network',
    description:
      "Reads the requests the open session's pages made since a cursor, as method, status or " +
      'failure, and a templated URL. Use after a step to see which call failed (a 500, a blocked ' +
      'request) or whether an expected call happened. Headers, cookies, request and response bodies ' +
      'and query values are never read, so none appear. The result is capped (`limit`, at most ' +
      `${String(MAX_LOG_READ_LIMIT)}); \`omittedCount\` says how many more there were and \`cursor\` ` +
      'continues from here. The full redacted log is registered as evidence. With `errorsOnly` only ' +
      'failed requests and statuses of 400 or more are returned. To judge a response body use ' +
      'qa.http_execute instead.',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    handler: (input) =>
      runBrowserNetwork(toBrowserOperationContext(dependencies), {
        sessionId: input.sessionId,
        ...(input.since !== undefined ? { since: input.since } : {}),
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.errorsOnly !== undefined ? { errorsOnly: input.errorsOnly } : {}),
        ...(input.stepId !== undefined ? { stepId: input.stepId } : {}),
      }),
  };
}
