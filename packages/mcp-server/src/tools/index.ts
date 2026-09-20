// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { pingTool } from './ping.js';
import type { ToolDefinition } from '../tool.js';

/** Every tool the server registers by default. P2-05 adds the real engine-operation tools here. */
export const BUILTIN_TOOLS: readonly ToolDefinition[] = [pingTool];
