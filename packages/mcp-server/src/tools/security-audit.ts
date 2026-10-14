// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runSecurityAuditCommand } from '@qa-ai-stlc/runner-security';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({});

const OutputSchema = z.object({
  auditId: z.string(),
  environment: z.string(),
  status: z.enum(['completed', 'partial']),
  stoppedReason: z.string().optional(),
  checks: z.array(z.object({ checkClass: z.string(), status: z.string(), note: z.string() })),
  findingCount: z.number().int(),
  requestCount: z.number().int(),
  evidencePath: z.string(),
  draftIds: z.array(z.string()),
});

/**
 * `qa.security_audit` (P6-18): the on-demand, authorized, non-destructive audit. Never part of the
 * pipeline; it starts only after the operator's approval of the exact authorization.
 */
export const securityAuditTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.security_audit',
  description:
    'Runs the security audit the operator authorized and approved: non-destructive checks of the ' +
    'authorized environment only (security headers, cookies, CORS, CSRF, authorization boundaries, ' +
    'session lifecycle, error payloads, encoding, and the code-assisted checks when source.path is ' +
    'set), within the authorized rate limit. Registers every finding as a defect draft that is not ' +
    'accepted, and returns counts, per-check status and the draft ids, not the findings: read the ' +
    'drafts. A status of partial is not a clean result. Fails with SECURITY_OUT_OF_SCOPE, ' +
    'SECURITY_NOT_AUTHORIZED or SECURITY_AUTHORIZATION_STALE. Use only when the operator asks for it.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler() {
    const summary = await runSecurityAuditCommand(createNodeEngineContext());
    return { ...summary, checks: [...summary.checks], draftIds: [...summary.draftIds] };
  },
};
