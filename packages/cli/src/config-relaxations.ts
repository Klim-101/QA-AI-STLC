// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError, loadLayeredConfig, type ConfigRelaxation, type ConfigSource } from '@qa-ai-stlc/core';
import type { CliIO } from './cli-io.js';

export function formatConfigRelaxation(relaxation: ConfigRelaxation): string {
  if (relaxation.kind === 'allowlist-entry') {
    return `warning: CONFIG_RELAXATION ${relaxation.localLayerPath} adds "${relaxation.hostname}" to the allowlist of environment "${relaxation.environment}", which .qa/config.yaml does not list`;
  }
  if (relaxation.kind === 'safe-non-get-request') {
    return `warning: CONFIG_RELAXATION ${relaxation.localLayerPath} lets safe mode send ${relaxation.method} ${relaxation.path} for environment "${relaxation.environment}" (${relaxation.reason}), which .qa/config.yaml does not list`;
  }
  return `warning: CONFIG_RELAXATION ${relaxation.localLayerPath} disables TLS certificate validation (tlsInsecure) for environment "${relaxation.environment}", which .qa/config.yaml does not`;
}

/**
 * Prints every relaxation of the effective configuration to stderr, one line each (ADR-011), so a
 * widened allowlist or disabled TLS validation in a local layer is never silent. Prints nothing
 * when the configuration cannot be loaded: the command itself reports that in its own way
 * (`doctor` as a failed check, every other command as its error), and some commands need no
 * configuration at all.
 */
export async function printConfigRelaxations(source: ConfigSource, io: CliIO): Promise<void> {
  let relaxations: readonly ConfigRelaxation[];
  try {
    ({ relaxations } = await loadLayeredConfig(source));
  } catch (error) {
    if (error instanceof QaError) {
      return;
    }
    throw error;
  }
  for (const relaxation of relaxations) {
    io.stderr(formatConfigRelaxation(relaxation));
  }
}
