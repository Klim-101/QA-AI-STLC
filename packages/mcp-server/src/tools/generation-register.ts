// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { registerVerifiedGeneratedTestSpec } from '@qa-ai-stlc/core';
import {
  GeneratedTestSpecSchema,
  RelativePathSchema,
  RunResultSchema,
  Sha256HexSchema,
} from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  spec: GeneratedTestSpecSchema.describe(
    'The exact "spec" qa.generation_verify returned for its "verified" outcome.',
  ),
  result: RunResultSchema.describe(
    'The exact "result" qa.generation_verify returned for its "verified" outcome.',
  ),
  contentSha256: Sha256HexSchema.describe(
    'The exact "contentSha256" qa.generation_verify returned for its "verified" outcome.',
  ),
});

const OutputSchema = z.object({
  filePath: RelativePathSchema,
});

/**
 * `qa.generation_register` (P3-06/P3-07): writes a verified spec's content to its real `filePath`
 * and registers it in the manifest — callable only with the exact `spec`/`result`/`contentSha256` a
 * `qa.generation_verify` `'verified'` outcome returned, so a caller cannot register a spec that has
 * not actually gone through verification, or content different from what was actually verified
 * (P3-18: `contentSha256` is checked against `spec.content` before anything is written).
 */
export const generationRegisterTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.generation_register',
  description:
    'Writes a verified generated spec to its real file path and registers it in the manifest. ' +
    'Pass the exact "spec", "result" and "contentSha256" a qa.generation_verify "verified" outcome ' +
    'returned — anything else is rejected.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler(input) {
    await registerVerifiedGeneratedTestSpec(createNodeEngineContext(), input.spec, {
      status: 'verified',
      result: input.result,
      contentSha256: input.contentSha256,
    });
    return { filePath: input.spec.filePath };
  },
};
