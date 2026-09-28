// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { registerVerifiedGeneratedTestSpec } from '@qa-ai-stlc/core';
import { GeneratedTestSpecSchema, RelativePathSchema, VerificationIdSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  spec: GeneratedTestSpecSchema.describe(
    'The exact "spec" qa.generation_verify returned for its "verified" outcome.',
  ),
  verificationId: VerificationIdSchema.describe(
    'The "verificationId" qa.generation_verify returned for its "verified" outcome.',
  ),
});

const OutputSchema = z.object({
  filePath: RelativePathSchema,
});

/**
 * `qa.generation_register` (P3-06/P3-07): writes a verified spec's content to its real `filePath`
 * and registers it in the manifest. The only authorization is `verificationId`, a reference to the
 * record the engine itself wrote when `qa.generation_verify` ran (P4-13); the caller never supplies
 * a result or hash, and one verification registers at most one spec.
 */
export const generationRegisterTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.generation_register',
  description:
    'Writes a verified generated spec to its real file path and registers it in the manifest. ' +
    'Pass the exact "spec" and "verificationId" a qa.generation_verify "verified" outcome returned. ' +
    'Rejected when no such verification ran, it did not end "verified", the spec differs from what ' +
    'was verified, or the verificationId was already used.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler(input) {
    await registerVerifiedGeneratedTestSpec(createNodeEngineContext(), input.spec, input.verificationId);
    return { filePath: input.spec.filePath };
  },
};
