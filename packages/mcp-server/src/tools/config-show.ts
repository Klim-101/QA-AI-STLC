// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runConfigShow } from '@qa-ai-stlc/core';
import { ConfigSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({});

const ViewportSizeValueSchema = z.object({ width: z.number(), height: z.number() });

const ConfigValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(ViewportSizeValueSchema),
]);

const ConfigShowValueSchema = z.object({
  path: z
    .array(z.string())
    .describe('The dotted key of one leaf of the effective configuration, split into segments.'),
  value: ConfigValueSchema,
  layer: z
    .enum(['committed', 'local', 'default'])
    .describe('".qa/config.yaml", the local layer file, or a ConfigSchema default no layer set.'),
});

const ConfigRelaxationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('allowlist-entry'),
    environment: z.string(),
    hostname: z.string(),
    localLayerPath: z.string(),
  }),
  z.object({
    kind: z.literal('tls-insecure'),
    environment: z.string(),
    localLayerPath: z.string(),
  }),
]);

const OutputSchema = z.object({
  config: ConfigSchema,
  localLayerPath: z.string().optional().describe('The local layer file, absent when none applied.'),
  values: z.array(ConfigShowValueSchema),
  relaxations: z.array(ConfigRelaxationSchema),
});

/**
 * `qa.config_show` (P6-22, ADR-011): the same `runConfigShow` core call `qa config show` uses —
 * the effective configuration merged from `.qa/config.yaml` and its optional local layer, the
 * source layer of every value, and every relaxation (a widened allowlist or disabled TLS
 * validation). Identity secrets are always environment-variable names, never resolved values.
 */
export const configShowTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.config_show',
  description:
    'Reports the effective configuration: .qa/config.yaml merged with its optional local layer ' +
    '(.qa/config.local.yaml or QA_CONFIG_LOCAL), the source layer of every value (committed, ' +
    'local or a schema default), and every relaxation the local layer introduces (a widened ' +
    'allowlist entry or tlsInsecure). Use to explain why a value differs from .qa/config.yaml, or ' +
    'to check for an unreviewed relaxation before running the pipeline.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler() {
    const result = await runConfigShow(createNodeEngineContext());
    return {
      config: result.config,
      ...(result.localLayerPath !== undefined ? { localLayerPath: result.localLayerPath } : {}),
      values: result.values.map((value) => ({
        path: [...value.path],
        value: ConfigValueSchema.parse(value.value),
        layer: value.layer,
      })),
      relaxations: result.relaxations.map((relaxation) => ({ ...relaxation })),
    };
  },
};
