// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { z } from 'zod';

/**
 * One MCP tool (AGENTS.md 12.3): a Zod input and output schema, and a handler that either
 * returns a value matching `outputSchema` or throws (a `QaError` for an expected failure, any
 * other error for a bug). `registerTool` (registry.ts) is the only place that turns a throw into
 * a structured, coded MCP result — handlers never format their own error response.
 */
export interface ToolDefinition<
  Input extends z.ZodObject = z.ZodObject,
  Output extends z.ZodObject = z.ZodObject,
> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Input;
  readonly outputSchema: Output;
  handler(input: z.infer<Input>): Promise<z.infer<Output>>;
}
