// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { SelectorRegistrySchema, type SelectorRegistry } from '@qa-ai-stlc/schemas';
import { loadConfig } from './config-loader.js';
import type { EngineContext } from './engine-context.js';
import { inEnvironmentOf, scopeOfEnvironment } from './environment-scope.js';
import { resolveBrowserEnvironment } from './operations/browser-open.js';
import type { QaStore } from './qa-store.js';

const REGISTRY_PATH = 'selectors/registry.json';
const CONFIG_PATH = 'config.yaml';

/**
 * The selector registry as one environment sees it (ADR-0020): the stored registry holds every
 * environment of the project, and generation and verification must not read an element that only
 * another environment has. `undefined` when there is no registry yet.
 *
 * The environment is the one named, or the only one configured; several environments and none named
 * is an error, as it is for the other operations that act on one. A project with no configuration
 * file has no environments to tell apart, and its registry is returned whole.
 */
export async function readRegistryForEnvironment(
  context: EngineContext,
  store: QaStore,
  environmentName: string | undefined,
): Promise<SelectorRegistry | undefined> {
  if (!(await store.pathExists(REGISTRY_PATH))) {
    return undefined;
  }
  const registry = await store.readJson(REGISTRY_PATH, SelectorRegistrySchema);
  if (!(await store.pathExists(CONFIG_PATH))) {
    return registry;
  }
  const config = await loadConfig(context);
  const environment = resolveBrowserEnvironment(config, environmentName);
  return {
    ...registry,
    elements: inEnvironmentOf(registry.elements, scopeOfEnvironment(environment.name, environment.config)),
  };
}
