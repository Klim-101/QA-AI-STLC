#!/usr/bin/env node
// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { processIO } from '../cli-io.js';
import { runCli } from '../cli.js';

// The one place `process.exit` is allowed (AGENTS.md 5.4); `runCli` itself only returns a code.
const exitCode = await runCli(process.argv.slice(2), { io: processIO });
process.exit(exitCode);
