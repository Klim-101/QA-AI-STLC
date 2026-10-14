// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runSecurityAuthorizationAdd } from '@qa-ai-stlc/core';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  path: z
    .string()
    .describe('Project-relative path to the authorization JSON (SecurityAuthorizationSchema) you drafted.'),
});

const OutputSchema = z.object({
  authorizationPath: z.string(),
  checks: z.array(z.string()),
  environment: z.string(),
});

/**
 * `qa.security_authorize` (P6-18): registers the audit authorization an agent drafted. Registering is
 * not consent; the operator approves it separately with `qa.security_approve`.
 */
export const securityAuthorizeTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.security_authorize',
  description:
    'Registers a security audit authorization you drafted as JSON: the environment (exactly as in ' +
    'qa.config_show), the check classes, the identities with a low or high role, the prohibited ' +
    'actions, any allowed mutations and restricted routes, and the rate limit. It is checked against ' +
    'the live configuration. Registering is not consent: the operator must approve it with ' +
    'qa.security_approve before qa.security_audit will run. Fails with SECURITY_OUT_OF_SCOPE when ' +
    'testing.security is not in-scope. Use only when the operator asks for a security audit.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler(input) {
    const result = await runSecurityAuthorizationAdd(createNodeEngineContext(), { path: input.path });
    return { ...result, checks: [...result.checks] };
  },
};
