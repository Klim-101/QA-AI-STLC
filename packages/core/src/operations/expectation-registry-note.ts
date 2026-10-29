// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { SelectorRegistrySchema, type RelativePath } from '@qa-ai-stlc/schemas';
import type { EngineContext } from '../engine-context.js';
import { findElementForSelector } from '../expectation-assertions.js';
import { QaStore } from '../qa-store.js';

const REGISTRY_PATH: RelativePath = 'selectors/registry.json';

/** Something the agent should act on before it records a result; the check itself is not a failure. */
export interface ExpectationNote {
  readonly code: string;
  readonly message: string;
  readonly remediation: string;
}

/**
 * The note for an expectation that names a selector no registry element carries, or `undefined`
 * when it is registered. A spec asserts only through the generated locator module, so an expectation
 * on an unregistered selector passes live and then blocks generation (`selector-not-in-registry`);
 * telling the agent here, while the page is still open, is the one moment it can register the element.
 */
export async function findUnregisteredSelectorNote(
  engine: EngineContext,
  selector: string,
): Promise<ExpectationNote | undefined> {
  const store = new QaStore({ projectRoot: engine.projectRoot, fs: engine.fs });
  if (await store.pathExists(REGISTRY_PATH)) {
    const registry = await store.readJson(REGISTRY_PATH, SelectorRegistrySchema);
    if (findElementForSelector(registry, selector) !== undefined) {
      return undefined;
    }
  }
  return {
    code: 'EXPECTATION_SELECTOR_NOT_REGISTERED',
    message: `The selector "${selector}" is not in the selector registry, so a spec cannot assert on it and qa-generate-tests will stop for this case.`,
    remediation:
      "Register the element with qa.registry_execute_register before leaving the page, or check a role/name-based element that is registered. A selector tied to one run's data (the title of a record this run created) can never be registered: find the record through a stable container or its role and name.",
  };
}
