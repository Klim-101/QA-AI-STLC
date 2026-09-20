// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from './registry.js';
import type { ToolDefinition } from './tool.js';

const SERVER_NAME = 'qa-ai-stlc';

export interface CreateQaMcpServerOptions {
  /** The running server's own version, reported to clients during initialization. */
  readonly version: string;
  readonly tools: readonly ToolDefinition[];
}

/** Builds the MCP server every tool registers on, not yet attached to a transport. */
export function createQaMcpServer(options: CreateQaMcpServerOptions): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: options.version });
  for (const tool of options.tools) {
    registerTool(server, tool);
  }
  return server;
}
