// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  ManifestStore,
  QaStore,
  parseLocatorModuleExports,
  resolveRelativePath,
  type EngineContext,
} from '@qa-ai-stlc/core';
import { SelectorRegistrySchema, type LocatorModuleExport } from '@qa-ai-stlc/schemas';
import { generateLocatorModule, type MissingLocatorElement } from '../generate-locator-module.js';
import { LOCATOR_MODULE_PATH, writeLocatorModule } from '../locator-module-file.js';
import { readPackageVersion } from '../package-version.js';

const REGISTRY_PATH = 'selectors/registry.json';

export interface SyncLocatorModuleResult {
  /** False when there is no registry yet, so there is nothing to render. */
  readonly hasRegistry: boolean;
  /** True when the module on disk differed from the registry and was rewritten. */
  readonly isModuleRewritten: boolean;
  /** Every element a spec may import, including those that share another element's function. */
  readonly exports: readonly LocatorModuleExport[];
  /** Active elements that have no export, with the reason. */
  readonly skipped: readonly MissingLocatorElement[];
}

/**
 * Makes `tests/qa/locators.ts` match `selectors/registry.json` without a crawl. An element
 * registered during an interactive session lands in the registry only, and the module is otherwise
 * written by `qa explore`, so a spec could not reference it without a raw selector. Rewrites the
 * module only when its content would change, so calling it before every read is cheap and leaves
 * the manifest alone.
 */
export async function runSyncLocatorModule(context: EngineContext): Promise<SyncLocatorModuleResult> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  if (!(await store.pathExists(REGISTRY_PATH))) {
    return { hasRegistry: false, isModuleRewritten: false, exports: [], skipped: [] };
  }
  const registry = await store.readJson(REGISTRY_PATH, SelectorRegistrySchema);
  const result = generateLocatorModule(registry, { generatorVersion: readPackageVersion() });
  const modulePath = resolveRelativePath(context.projectRoot, LOCATOR_MODULE_PATH);
  const previous = (await context.fs.pathExists(modulePath))
    ? await context.fs.readFile(modulePath)
    : undefined;
  const isModuleRewritten = previous !== result.source;
  if (isModuleRewritten) {
    await writeLocatorModule(context, new ManifestStore({ store, clock: context.clock }), result);
  }
  return {
    hasRegistry: true,
    isModuleRewritten,
    exports: parseLocatorModuleExports(result.source),
    skipped: result.missingLocators,
  };
}
