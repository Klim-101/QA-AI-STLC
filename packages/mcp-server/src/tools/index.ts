// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { approveTool } from './approve.js';
import { casesAddTool } from './cases-add.js';
import { doctorTool } from './doctor.js';
import { exploreTool } from './explore.js';
import { pingTool } from './ping.js';
import { scopeTool } from './scope.js';
import { validateTool } from './validate.js';
import type { ToolDefinition } from '../tool.js';

/** Every tool the server registers by default (P2-05: one MCP counterpart per engine operation). */
export const BUILTIN_TOOLS: readonly ToolDefinition[] = [
  pingTool,
  doctorTool,
  exploreTool,
  scopeTool,
  casesAddTool,
  approveTool,
  validateTool,
];
