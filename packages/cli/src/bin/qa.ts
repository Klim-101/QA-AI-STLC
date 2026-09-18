#!/usr/bin/env node
// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { processIO } from '../cli-io.js';
import { runCli } from '../cli.js';

// `runCli` itself only returns a code; setting `process.exitCode` (not calling `process.exit()`)
// lets Node drain the event loop naturally before exiting. A forced `process.exit()` right after
// a `fetch()` call (`qa doctor`'s reachability check) crashes on Windows with a libuv assertion
// ("UV_HANDLE_CLOSING") because undici's keep-alive socket handle has not finished closing yet —
// found running `qa doctor` against a real environment (P1-16).
process.exitCode = await runCli(process.argv.slice(2), { io: processIO });
