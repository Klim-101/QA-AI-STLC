// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { registerDefectDraft, type EngineContext } from '@qa-ai-stlc/core';
import type { RelativePath, SecurityAuditResult } from '@qa-ai-stlc/schemas';
import { DEFAULT_SECURITY_CHECKS } from './default-checks.js';
import { runSecurityAudit, type RunSecurityAuditOptions } from './security-audit.js';

export interface SecurityAuditSummary {
  readonly auditId: string;
  readonly environment: string;
  /** `partial` is not a clean bill: the audit stopped early or a check could not complete. */
  readonly status: SecurityAuditResult['status'];
  readonly stoppedReason?: string;
  readonly checks: readonly {
    readonly checkClass: string;
    readonly status: string;
    /** What the check says about how it went; empty when it says nothing. */
    readonly note: string;
  }[];
  readonly findingCount: number;
  readonly requestCount: number;
  /** The registered audit result every draft cites as evidence. */
  readonly evidencePath: RelativePath;
  /** One draft per finding, registered and never accepted: acceptance is the operator's gate. */
  readonly draftIds: readonly string[];
}

/**
 * `qa security audit` / MCP `qa.security_audit` (P6-18): runs every check this version has that the
 * approved authorization lists, then registers each finding as a defect draft through the same rules
 * a hand-written draft meets. The audit refuses to start without an in-scope project and an approved,
 * current authorization (`runSecurityAudit`); nothing here relaxes that. Returns counts and ids, not
 * findings: the drafts hold them.
 */
export async function runSecurityAuditCommand(
  context: EngineContext,
  options: Omit<RunSecurityAuditOptions, 'checks'> = {},
): Promise<SecurityAuditSummary> {
  const outcome = await runSecurityAudit(context, { ...options, checks: DEFAULT_SECURITY_CHECKS });
  for (const draft of outcome.drafts) {
    await registerDefectDraft(context, draft);
  }
  const { result } = outcome;
  return {
    auditId: result.auditId,
    environment: result.environment,
    status: result.status,
    ...(result.stoppedReason !== undefined ? { stoppedReason: result.stoppedReason } : {}),
    checks: result.checks.map((entry) => ({
      checkClass: entry.checkClass,
      status: entry.status,
      note: entry.note ?? '',
    })),
    findingCount: result.findings.length,
    requestCount: result.requests.length,
    evidencePath: outcome.evidencePath,
    draftIds: outcome.drafts.map((draft) => draft.id),
  };
}
