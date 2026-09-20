#!/usr/bin/env node
// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readPackageVersion } from '../package-version.js';
import { createQaMcpServer } from '../server.js';
import { BUILTIN_TOOLS } from '../tools/index.js';

const server = createQaMcpServer({ version: readPackageVersion(), tools: BUILTIN_TOOLS });
await server.connect(new StdioServerTransport());
