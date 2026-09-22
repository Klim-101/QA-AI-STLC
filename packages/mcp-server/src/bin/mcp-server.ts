#!/usr/bin/env node
// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { QaError } from '@qa-ai-stlc/core';
import { readPackageVersion } from '../package-version.js';
import { createQaMcpServer } from '../server.js';
import { createBrowserToolDependencies } from '../tools/browser-dependencies.js';
import { createBuiltinTools } from '../tools/index.js';
import { checkEngineVersionHandshake } from '../version-handshake.js';

const actualVersion = readPackageVersion();

try {
  checkEngineVersionHandshake({
    actualVersion,
    expectedVersion: process.env.QA_EXPECTED_ENGINE_VERSION,
  });
} catch (error) {
  if (!(error instanceof QaError)) {
    throw error;
  }
  process.stderr.write(`${error.message}\n`);
  if (error.remediation !== undefined) {
    process.stderr.write(`${error.remediation}\n`);
  }
  process.exit(1);
}

// One session store for the process: the browser tools close over it so an exploratory session
// survives across the separate MCP requests that drive it (ADR-005).
const browserTools = createBrowserToolDependencies();

const server = createQaMcpServer({
  version: actualVersion,
  tools: createBuiltinTools(browserTools),
});

// Without this, killing the host would leave any browser this process launched running.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void browserTools.sessions.closeAll().finally(() => {
      process.exit(0);
    });
  });
}

await server.connect(new StdioServerTransport());
