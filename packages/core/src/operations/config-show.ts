// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Config } from '@qa-ai-stlc/schemas';
import { buildConfigShowValues, type ConfigRelaxation, type ConfigShowValue } from '../config-layers.js';
import { loadLayeredConfig } from '../config-loader.js';
import type { EngineContext } from '../engine-context.js';

export interface ConfigShowResult {
  readonly config: Config;
  readonly localLayerPath: string | undefined;
  readonly values: readonly ConfigShowValue[];
  readonly relaxations: readonly ConfigRelaxation[];
}

/**
 * `qa config show [--explain]` / MCP `qa.config_show` (P6-22, ADR-011): the effective
 * configuration, the source layer of every value (`committed`, `local` or `default`), and every
 * relaxation. Identity secrets stay names only (`secret: QA_...`) — `loadLayeredConfig` never
 * resolves an environment variable, so no credential value can appear in the result.
 */
export async function runConfigShow(context: EngineContext): Promise<ConfigShowResult> {
  const loaded = await loadLayeredConfig(context);
  return {
    config: loaded.config,
    localLayerPath: loaded.localLayerPath,
    values: buildConfigShowValues(loaded.config, loaded.sources),
    relaxations: loaded.relaxations,
  };
}
