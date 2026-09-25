// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runHttpExecute } from '@qa-ai-stlc/core';
import { EvidenceSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  runId: z.string().describe("The run id to register this call's evidence under."),
  url: z.string().describe('The URL to call.'),
  method: z.string().optional().describe('HTTP method. Defaults to GET.'),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  tlsInsecure: z.boolean().optional().describe('Skip TLS certificate verification. Off by default.'),
});

const OutputSchema = z.object({
  status: z.number(),
  evidence: EvidenceSchema,
});

/**
 * `qa.http_execute` (P3-14/P3-15): makes one real HTTP call for the "api" test type, no browser
 * involved, and registers the request/response as evidence. The response body is stored as a
 * capped preview; the engine never decides pass or fail — compare the status and body against the
 * case's expected result yourself.
 */
export const httpExecuteTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.http_execute',
  description:
    'Makes one real HTTP call and registers the request/response as evidence, for the "api" ' +
    'test type. Returns the status code only — compare it and the recorded evidence against the ' +
    "case's expected result yourself; the engine never decides pass or fail.",
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  handler: (input) =>
    runHttpExecute(createNodeEngineContext(), {
      runId: input.runId,
      url: input.url,
      ...(input.method !== undefined ? { method: input.method } : {}),
      ...(input.headers !== undefined ? { headers: input.headers } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.tlsInsecure !== undefined ? { tlsInsecure: input.tlsInsecure } : {}),
    }),
};
