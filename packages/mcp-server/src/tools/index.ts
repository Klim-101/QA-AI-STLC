// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { apiDiffTool } from './api-diff.js';
import { approveTool } from './approve.js';
import { createBrowserAccessibilityScanTool } from './browser-accessibility-scan.js';
import { createBrowserClickTool } from './browser-click.js';
import { createBrowserCloseTool } from './browser-close.js';
import { createBrowserToolDependencies, type BrowserToolDependencies } from './browser-dependencies.js';
import { createBrowserExpectTool } from './browser-expect.js';
import { createBrowserCheckTool } from './browser-check.js';
import { createBrowserFillTool } from './browser-fill.js';
import { createBrowserHoverTool } from './browser-hover.js';
import { createBrowserConsoleTool } from './browser-console.js';
import { createBrowserNetworkTool } from './browser-network.js';
import { createBrowserTabsTool } from './browser-tabs.js';
import { createBrowserUploadTool } from './browser-upload.js';
import { createBrowserWaitForTool } from './browser-wait-for.js';
import { createBrowserPressTool } from './browser-press.js';
import { createBrowserGridFindRowTool, createBrowserGridReadCellTool } from './browser-grid.js';
import { createBrowserNavigateTool } from './browser-navigate.js';
import { createBrowserAttachTool } from './browser-attach.js';
import { createBrowserOpenTool } from './browser-open.js';
import { createBrowserClosePopupTool, createBrowserOpenPopupTool } from './browser-popup.js';
import { createBrowserSelectOptionTool } from './browser-select-option.js';
import { createBrowserSetDateTool } from './browser-set-date.js';
import { createBrowserSnapshotTool } from './browser-snapshot.js';
import { caseResultRegisterTool } from './case-result-register.js';
import { casesAddTool } from './cases-add.js';
import { casesRenderTool } from './cases-render.js';
import { defectAcceptTool } from './defect-accept.js';
import { defectAddTool } from './defect-add.js';
import { rcaAddTool } from './rca-add.js';
import { rcaApproveTool } from './rca-approve.js';
import { configAddTool } from './config-add.js';
import { configSetTool } from './config-set.js';
import { configShowTool } from './config-show.js';
import { doctorTool } from './doctor.js';
import { exploreTool } from './explore.js';
import { generationManualRegionsApplyTool } from './generation-manual-regions-apply.js';
import { generationManualRegionsExtractTool } from './generation-manual-regions-extract.js';
import { generationProvenSessionTool } from './generation-proven-session.js';
import { generationRegisterTool } from './generation-register.js';
import { generationSpokeInputTool } from './generation-spoke-input.js';
import { generationVerifyTool } from './generation-verify.js';
import { createHttpExecuteTool } from './http-execute.js';
import { initTool } from './init.js';
import { linkTool } from './link.js';
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
  initTool,
  configShowTool,
  configSetTool,
  configAddTool,
  exploreTool,
  apiDiffTool,
  scopeTool,
  casesAddTool,
  casesRenderTool,
  testDataAddTool,
  approveTool,
  defectAddTool,
  defectAcceptTool,
  rcaAddTool,
  rcaApproveTool,
  validateTool,
  caseResultRegisterTool,
  generationProvenSessionTool,
  generationSpokeInputTool,
  generationManualRegionsExtractTool,
  generationManualRegionsApplyTool,
  generationVerifyTool,
  generationRegisterTool,
  runTool,
  linkTool,
  reportTool,
];

/** The `qa.browser_*`/`qa.registry_execute_register` tools, and `qa.http_execute`, which can read a token from one of their sessions, sharing one session store (ADR-005, P2-06). */
export function createBrowserTools(dependencies: BrowserToolDependencies): readonly ToolDefinition[] {
  return [
    createBrowserOpenTool(dependencies),
    createBrowserAttachTool(dependencies),
    createBrowserNavigateTool(dependencies),
    createBrowserClickTool(dependencies),
    createBrowserFillTool(dependencies),
    createBrowserPressTool(dependencies),
    createBrowserHoverTool(dependencies),
    createBrowserCheckTool(dependencies),
    createBrowserSelectOptionTool(dependencies),
    createBrowserSetDateTool(dependencies),
    createBrowserOpenPopupTool(dependencies),
    createBrowserClosePopupTool(dependencies),
    createBrowserGridFindRowTool(dependencies),
    createBrowserGridReadCellTool(dependencies),
    createBrowserSnapshotTool(dependencies),
    createBrowserExpectTool(dependencies),
    createBrowserWaitForTool(dependencies),
    createBrowserTabsTool(dependencies),
    createBrowserUploadTool(dependencies),
    createBrowserConsoleTool(dependencies),
    createBrowserNetworkTool(dependencies),
    createBrowserAccessibilityScanTool(dependencies),
    createRegistryExecuteRegisterTool(dependencies),
    createBrowserCloseTool(dependencies),
    createHttpExecuteTool(dependencies),
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
