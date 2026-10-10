// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  EvidenceStore,
  ManifestStore,
  QaError,
  QaStore,
  assertSecurityAuthorized,
  loadConfig,
  randomIdGenerator,
  securityFindingToDefectDraft,
  toCanonicalJson,
  type EngineContext,
  type IdGenerator,
} from '@qa-ai-stlc/core';
import {
  SECURITY_CHECK_CLASSES,
  type DefectDraft,
  type RelativePath,
  type SecurityAuditResult,
  type SecurityAuthorization,
  type SecurityCheckStatus,
  type SecurityFinding,
} from '@qa-ai-stlc/schemas';
import {
  NO_IDENTITY_SESSIONS,
  openIdentitySessions,
  type IdentitySessions,
  type OpenIdentitySessionsOptions,
} from './identity-sessions.js';
import type { SecurityCheck } from './security-check.js';
import { SecurityProbe } from './security-probe.js';

export interface RunSecurityAuditOptions {
  /** The check implementations to run; only classes the authorization names are used. */
  readonly checks: readonly SecurityCheck[];
  readonly idGenerator?: IdGenerator;
  /** See `SecurityProbeOptions.pause`. */
  readonly pause?: (milliseconds: number) => Promise<void>;
  readonly requestTimeoutMs?: number;
  /** See `OpenIdentitySessionsOptions`. */
  readonly identities?: OpenIdentitySessionsOptions;
}

export interface SecurityAuditOutcome {
  readonly result: SecurityAuditResult;
  /** Where the engine registered the audit result; defect drafts cite it as evidence. */
  readonly evidencePath: RelativePath;
  /** One tracker-neutral draft per finding, none accepted: acceptance is a separate gate. */
  readonly drafts: readonly DefectDraft[];
}

type CheckEntry = SecurityAuditResult['checks'][number];

function skipped(checkClass: CheckEntry['checkClass'], note: string): CheckEntry {
  return { checkClass, status: 'skipped', note, findingIds: [] };
}

/**
 * Runs the authorized black-box security checks and registers what they found. It refuses to start
 * without an approved, current authorization (`assertSecurityAuthorized`), then gives every check
 * the same probe, which holds the authorized limits. A check the authorization lists but this
 * version cannot run is `skipped`, never silently omitted or reported `passed`; a check that
 * could not complete is `blocked`, and the audit is then `partial` rather than a clean bill.
 */
export async function runSecurityAudit(
  context: EngineContext,
  options: RunSecurityAuditOptions,
): Promise<SecurityAuditOutcome> {
  const authorization = await assertSecurityAuthorized(context);
  const config = await loadConfig(context);
  const idGenerator = options.idGenerator ?? randomIdGenerator;
  const auditId = `audit-${idGenerator.next()}`;
  const startedAt = context.clock.now().toISOString();

  const probe = new SecurityProbe({
    httpClient: context.httpClient,
    authorization,
    tlsInsecure: config.environments[authorization.environment.name]?.tlsInsecure === true,
    ...(options.pause !== undefined ? { pause: options.pause } : {}),
    ...(options.requestTimeoutMs !== undefined ? { requestTimeoutMs: options.requestTimeoutMs } : {}),
  });

  const identities =
    authorization.identities.length > 0
      ? await openIdentitySessions(context, authorization, options.identities)
      : NO_IDENTITY_SESSIONS;
  const { checks, findings, stoppedReason } = await runChecks(
    context,
    authorization,
    probe,
    identities,
    options.checks,
  );
  const isClean = stoppedReason === undefined && checks.every((entry) => entry.status !== 'blocked');
  const result: SecurityAuditResult = {
    schemaVersion: 1,
    auditId,
    environment: authorization.environment.name,
    startedAt,
    finishedAt: context.clock.now().toISOString(),
    status: isClean ? 'completed' : 'partial',
    ...(stoppedReason !== undefined ? { stoppedReason } : {}),
    checks,
    findings,
    requests: probe.log,
  };
  assertFindingsCiteRequests(result);

  const evidencePath = await registerAuditResult(context, result, idGenerator);
  const drafts = findings.map((finding) =>
    securityFindingToDefectDraft(finding, {
      environment: result.environment,
      evidencePaths: [evidencePath],
      createdAt: result.finishedAt,
    }),
  );
  return { result, evidencePath, drafts };
}

async function runChecks(
  context: EngineContext,
  authorization: SecurityAuthorization,
  probe: SecurityProbe,
  identities: IdentitySessions,
  implementations: readonly SecurityCheck[],
): Promise<{ checks: CheckEntry[]; findings: SecurityFinding[]; stoppedReason?: string }> {
  const entries: CheckEntry[] = [];
  const findings: SecurityFinding[] = [];
  let stoppedReason: string | undefined;

  for (const checkClass of SECURITY_CHECK_CLASSES) {
    if (!authorization.checks.includes(checkClass)) {
      continue;
    }
    if (stoppedReason !== undefined) {
      entries.push(skipped(checkClass, `Not run: ${stoppedReason}.`));
      continue;
    }
    const implementation = implementations.find((candidate) => candidate.checkClass === checkClass);
    if (implementation === undefined) {
      entries.push(skipped(checkClass, 'This version has no implementation of the check.'));
      continue;
    }
    try {
      const outcome = await implementation.run({ probe, authorization, identities });
      for (const finding of outcome.findings) {
        if (finding.checkClass !== checkClass || findings.some((known) => known.id === finding.id)) {
          throw new QaError(
            'SECURITY_FINDING_INVALID',
            `The "${checkClass}" check returned finding "${finding.id}" of class "${finding.checkClass}", or reused an id`,
            { remediation: 'A check reports only its own class, with ids unique across the audit.' },
          );
        }
        findings.push(finding);
      }
      const status: SecurityCheckStatus = outcome.findings.length > 0 ? 'failed' : outcome.status;
      entries.push({
        checkClass,
        status,
        ...(outcome.note !== undefined ? { note: outcome.note } : {}),
        findingIds: outcome.findings.map((finding) => finding.id),
      });
    } catch (error) {
      if (!(error instanceof QaError)) {
        throw error;
      }
      context.logger.error('A security check could not complete', { code: error.code, checkClass });
      entries.push({ checkClass, status: 'blocked', note: error.message, findingIds: [] });
      if (error.code === 'SECURITY_BUDGET_EXHAUSTED') {
        stoppedReason = 'the authorized request budget was used up';
      }
    }
  }
  return { checks: entries, findings, ...(stoppedReason !== undefined ? { stoppedReason } : {}) };
}

// A finding that cites a request the audit never made would point a reviewer at nothing.
function assertFindingsCiteRequests(result: SecurityAuditResult): void {
  for (const finding of result.findings) {
    const invalid = finding.requestIndexes.filter((index) => index >= result.requests.length);
    if (invalid.length > 0) {
      throw new QaError(
        'SECURITY_FINDING_INVALID',
        `Finding "${finding.id}" cites request(s) ${invalid.join(', ')} that the audit did not make`,
        { remediation: 'A finding cites positions in the audit request log.' },
      );
    }
  }
}

async function registerAuditResult(
  context: EngineContext,
  result: SecurityAuditResult,
  idGenerator: IdGenerator,
): Promise<RelativePath> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const evidenceStore = new EvidenceStore({ store, manifest, clock: context.clock });
  const registration = await evidenceStore.register({
    id: `evidence-${idGenerator.next()}`,
    runId: `security-${result.auditId}`,
    kind: 'other',
    fileExtension: 'json',
    content: toCanonicalJson(result),
  });
  if (registration.status === 'quarantined') {
    throw new QaError(
      'SECURITY_EVIDENCE_QUARANTINED',
      `The audit result matched ${registration.patterns.join(', ')} and was quarantined instead of registered`,
      {
        remediation: `A sanitized receipt is at ${registration.receiptPath}. Remove the secret from the application's responses.`,
      },
    );
  }
  return registration.evidence.path;
}
