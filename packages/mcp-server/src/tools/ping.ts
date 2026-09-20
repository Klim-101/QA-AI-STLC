// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { readPackageVersion } from '../package-version.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({});
const OutputSchema = z.object({
  pong: z.literal(true),
  version: z.string(),
});

/**
 * A health check owned by the server itself, not an engine operation (those are P2-05's other
 * tools): proves the process is up and the tool-call round trip works, without touching `.qa/` or
 * the engine at all.
 */
export const pingTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.ping',
  description: 'Checks that the QA-AI-STLC MCP server is running and responding to tool calls.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  handler: () => Promise.resolve({ pong: true, version: readPackageVersion() }),
};
