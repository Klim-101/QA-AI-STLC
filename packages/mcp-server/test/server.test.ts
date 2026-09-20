// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { QaError } from '@qa-ai-stlc/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createQaMcpServer } from '../src/server.js';
import type { ToolDefinition } from '../src/tool.js';
import { pingTool } from '../src/tools/ping.js';

describe('createQaMcpServer (end-to-end over a real MCP transport)', () => {
  it('lists every registered tool', async () => {
    const { client } = await connectedClient([pingTool]);

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toEqual(['qa.ping']);
  });

  it('returns structured content for a successful tool call', async () => {
    const { client } = await connectedClient([pingTool]);

    const result = await client.callTool({ name: 'qa.ping', arguments: {} });

    expect(result.isError).toBeFalsy();
    const structuredContent = result.structuredContent as { pong: boolean; version: string };
    expect(structuredContent.pong).toBe(true);
    expect(structuredContent.version).toEqual(expect.any(String));
  });

  it('rejects a tool call missing a required input field with a coded error', async () => {
    const nameTool: ToolDefinition = {
      name: 'test.requires-name',
      description: 'Requires a name.',
      inputSchema: z.object({ name: z.string() }),
      outputSchema: z.object({ greeting: z.string() }),
      handler: (input) => Promise.resolve({ greeting: `Hello, ${(input as { name: string }).name}.` }),
    };
    const { client } = await connectedClient([nameTool]);

    const result = await client.callTool({ name: 'test.requires-name', arguments: {} });

    expect(result.isError).toBe(true);
  });

  it("wraps a handler's QaError into a structured, coded error result", async () => {
    const failingTool: ToolDefinition = {
      name: 'test.fails',
      description: 'Always throws a QaError.',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      handler: () => {
        throw new QaError('TEST_FAILURE', 'This tool always fails', { remediation: 'Do not call it.' });
      },
    };
    const { client } = await connectedClient([failingTool]);

    const result = await client.callTool({ name: 'test.fails', arguments: {} });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    const payload: unknown = JSON.parse(content[0]?.text ?? '{}');
    expect(payload).toEqual({
      code: 'TEST_FAILURE',
      message: 'This tool always fails',
      remediation: 'Do not call it.',
    });
  });

  it('wraps an unexpected error into a generic internal-error code, not a raw stack trace', async () => {
    const buggyTool: ToolDefinition = {
      name: 'test.buggy',
      description: 'Throws a plain Error, simulating a bug rather than an expected failure.',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      handler: () => {
        throw new Error('unexpected');
      },
    };
    const { client } = await connectedClient([buggyTool]);

    const result = await client.callTool({ name: 'test.buggy', arguments: {} });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    const payload: unknown = JSON.parse(content[0]?.text ?? '{}');
    expect(payload).toMatchObject({ code: 'MCP_TOOL_INTERNAL_ERROR', message: 'unexpected' });
  });
});

async function connectedClient(tools: readonly ToolDefinition[]): Promise<{ client: Client }> {
  const server = createQaMcpServer({ version: '0.0.0-test', tools });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client };
}
