// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { resolveRelativePath, type EngineContext, type ManifestStore } from '@qa-ai-stlc/core';
import type { GenerateLocatorModuleResult } from './generate-locator-module.js';

export const LOCATOR_MODULE_PATH = 'tests/qa/locators.ts';

/**
 * Writes a rendered locator module and registers its hash. The one place that writes
 * `tests/qa/locators.ts`, so a crawl and a session registration cannot drift apart.
 */
export async function writeLocatorModule(
  context: EngineContext,
  manifest: ManifestStore,
  moduleResult: GenerateLocatorModuleResult,
): Promise<void> {
  await context.fs.mkdir(resolveRelativePath(context.projectRoot, 'tests/qa'));
  await context.fs.writeFile(
    resolveRelativePath(context.projectRoot, LOCATOR_MODULE_PATH),
    moduleResult.source,
  );
  await manifest.register(LOCATOR_MODULE_PATH, moduleResult.source, { root: 'project' });
}
