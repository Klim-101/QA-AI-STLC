// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runSecurityAuthorizationApprove } from '@qa-ai-stlc/core';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  approvedBy: z.string().describe('The operator who approved the audit (a name).'),
  note: z.string().optional(),
});

const OutputSchema = z.object({ wasAlreadyApproved: z.boolean() });

/**
 * `qa.security_approve` (P6-18, ADR-003): the audit-authorization gate. Records the operator's
 * approval bound to the exact registered content; editing the authorization withdraws it.
 */
export const securityApproveTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.security_approve',
  description:
    'Records the operator approval of the registered security audit authorization, hash-bound to its ' +
    'exact content, so that editing it afterwards withdraws the consent. This is the operator’s ' +
    'decision to allow requests to their application: call it only when the operator has read the ' +
    'authorization and told you to approve it, naming who approved. Fails with ' +
    'SECURITY_AUTHORIZATION_NOT_FOUND or SECURITY_OUT_OF_SCOPE.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  handler: (input) =>
    runSecurityAuthorizationApprove(createNodeEngineContext(), {
      approvedBy: input.approvedBy,
      ...(input.note !== undefined ? { note: input.note } : {}),
    }),
};
