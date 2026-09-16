// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { ConfigSchema, type Config, type RelativePath } from '@qa-ai-stlc/schemas';
import { parse as parseYaml } from 'yaml';
import { QaError } from './errors.js';
import type { QaStore } from './qa-store.js';

const CONFIG_PATH: RelativePath = 'config.yaml';

/**
 * Reads and validates `.qa/config.yaml` against `ConfigSchema`, the schema-versioned contract
 * every other package trusts. Throws `QaError` with a stable `code` and a remediation an agent
 * or CLI flag can act on, never a bare Zod or YAML parse error (AGENTS.md 5.4).
 */
export async function loadConfig(store: QaStore): Promise<Config> {
  const exists = await store.pathExists(CONFIG_PATH);
  if (!exists) {
    throw new QaError('CONFIG_MISSING', 'No .qa/config.yaml found', {
      remediation: 'Run "qa init" to create the .qa/ store and its configuration file.',
    });
  }

  const raw = await store.readText(CONFIG_PATH);
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error) {
    throw new QaError('CONFIG_MALFORMED', '.qa/config.yaml is not valid YAML', {
      remediation: 'Fix the YAML syntax reported below and re-run.',
      cause: error,
    });
  }

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new QaError(
      'CONFIG_INVALID',
      `.qa/config.yaml does not match its schema:\n${z.prettifyError(result.error)}`,
      {
        remediation: 'Fix the reported fields or regenerate the file with "qa init".',
        cause: result.error,
      },
    );
  }
  return result.data;
}
