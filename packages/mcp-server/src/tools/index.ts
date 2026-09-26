// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { approveTool } from './approve.js';
import { createBrowserAccessibilityScanTool } from './browser-accessibility-scan.js';
import { createBrowserClickTool } from './browser-click.js';
import { createBrowserCloseTool } from './browser-close.js';
import { createBrowserToolDependencies, type BrowserToolDependencies } from './browser-dependencies.js';
import { createBrowserFillTool } from './browser-fill.js';
import { createBrowserNavigateTool } from './browser-navigate.js';
import { createBrowserOpenTool } from './browser-open.js';
import { createBrowserSnapshotTool } from './browser-snapshot.js';
import { caseResultRegisterTool } from './case-result-register.js';
import { casesAddTool } from './cases-add.js';
import { casesRenderTool } from './cases-render.js';
import { doctorTool } from './doctor.js';
import { exploreTool } from './explore.js';
import { generationProvenSessionTool } from './generation-proven-session.js';
import { httpExecuteTool } from './http-execute.js';
import { pingTool } from './ping.js';
import { createRegistryExecuteRegisterTool } from './registry-execute-register.js';
import { reportTool } from './report.js';
import { runTool } from './run.js';
import { scopeTool } from './scope.js';
import { testDataAddTool } from './test-data-add.js';
import { validateTool } from './validate.js';
import type { ToolDefinition } from '../tool.js';

/** The tools that rebuild their whole world per call and so need nothing from the server. */
export const BUILTIN_TOOLS: readonly ToolDefinition[] = [
  pingTool,
  doctorTool,
  exploreTool,
  scopeTool,
  casesAddTool,
  casesRenderTool,
  testDataAddTool,
  approveTool,
  validateTool,
  httpExecuteTool,
  caseResultRegisterTool,
  generationProvenSessionTool,
  runTool,
  reportTool,
];

/** The eight `qa.browser_*`/`qa.registry_execute_register` tools sharing one session store (ADR-005, P2-06). */
export function createBrowserTools(dependencies: BrowserToolDependencies): readonly ToolDefinition[] {
  return [
    createBrowserOpenTool(dependencies),
    createBrowserNavigateTool(dependencies),
    createBrowserClickTool(dependencies),
    createBrowserFillTool(dependencies),
    createBrowserSnapshotTool(dependencies),
    createBrowserAccessibilityScanTool(dependencies),
    createRegistryExecuteRegisterTool(dependencies),
    createBrowserCloseTool(dependencies),
  ];
}

/**
 * Every tool the server registers by default (P2-05: one MCP counterpart per engine operation).
 * A function rather than a constant because the browser tools close over live sessions, which
 * the caller owns so it can close them on shutdown.
 */
export function createBuiltinTools(
  dependencies: BrowserToolDependencies = createBrowserToolDependencies(),
): readonly ToolDefinition[] {
  return [...BUILTIN_TOOLS, ...createBrowserTools(dependencies)];
}
