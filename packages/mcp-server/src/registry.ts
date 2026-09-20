// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';
import type { ToolDefinition } from './tool.js';
import { toToolErrorPayload } from './tool-error.js';

/**
 * Registers `definition` on `server`, adapting its `z.ZodObject` schemas into the SDK's raw-shape
 * tool API. A thrown error becomes a structured, coded `CallToolResult` (AGENTS.md 5.4, 12.3)
 * built here, rather than reaching the SDK's own generic catch, which would collapse it to a bare
 * message string and drop the `code`/`remediation` an agent needs to act on it.
 */
export function registerTool<Input extends z.ZodObject, Output extends z.ZodObject>(
  server: McpServer,
  definition: ToolDefinition<Input, Output>,
): void {
  server.registerTool(
    definition.name,
    {
      description: definition.description,
      inputSchema: definition.inputSchema.shape,
      outputSchema: definition.outputSchema.shape,
    },
    async (rawInput: unknown): Promise<CallToolResult> => {
      try {
        // The SDK already validated `rawInput` against `definition.inputSchema.shape` before
        // calling this handler, so it is a real `z.infer<Input>` at runtime; TypeScript cannot
        // prove that through two layers of generic indirection (registerTool's own generics,
        // then the SDK's), so the cast documents an invariant the SDK enforces, not a bypass.
        const output = await definition.handler(rawInput as z.infer<Input>);
        return {
          content: [{ type: 'text', text: `${definition.name} succeeded.` }],
          structuredContent: output,
        };
      } catch (error) {
        const payload = toToolErrorPayload(error);
        return { content: [{ type: 'text', text: JSON.stringify(payload) }], isError: true };
      }
    },
  );
}
