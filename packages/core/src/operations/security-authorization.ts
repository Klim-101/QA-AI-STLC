// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  SecurityAuthorizationSchema,
  type Approval,
  type Config,
  type RelativePath,
  type SecurityAuthorization,
} from '@qa-ai-stlc/schemas';
import { ApprovalLedgerStore } from '../approval-ledger-store.js';
import { loadConfig } from '../config-loader.js';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { hashText } from '../hash.js';
import { readJsonFile, toCanonicalJson } from '../json-file.js';
import { ManifestStore } from '../manifest-store.js';
import { assertRelativePath, resolveRelativePath } from '../paths.js';
import { QaStore } from '../qa-store.js';
import {
  SECURITY_AUTHORIZATION_GATE,
  SECURITY_AUTHORIZATION_PATH,
  SecurityAuthorizationStore,
} from '../security-authorization-store.js';

function openStores(context: EngineContext): {
  readonly ledger: ApprovalLedgerStore;
  readonly authorizations: SecurityAuthorizationStore;
} {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const ledger = new ApprovalLedgerStore({ store, manifest });
  return { ledger, authorizations: new SecurityAuthorizationStore({ store, manifest, ledger }) };
}

function assertSecurityInScope(config: Config): void {
  if (config.testing.security !== 'in-scope') {
    throw new QaError(
      'SECURITY_OUT_OF_SCOPE',
      `Security testing is "${config.testing.security}" for this project, so no audit can be authorized`,
      {
        remediation:
          'Decide it with "qa config set testing.security in-scope" if the operator wants an audit.',
      },
    );
  }
}

function sameAllowlist(a: readonly string[], b: readonly string[]): boolean {
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.length === sortedB.length && sortedA.every((entry, index) => entry === sortedB[index]);
}

/** Why the live configuration is no longer the environment the authorization names, if it is not. */
function findEnvironmentMismatch(authorization: SecurityAuthorization, config: Config): string | undefined {
  const live = config.environments[authorization.environment.name];
  if (live === undefined) {
    return `environment "${authorization.environment.name}" is not in the configuration`;
  }
  if (live.baseUrl !== authorization.environment.baseUrl) {
    return `the base URL changed from ${authorization.environment.baseUrl} to ${live.baseUrl}`;
  }
  if (!sameAllowlist(live.allowlist, authorization.environment.allowlist)) {
    return 'the domain allowlist differs from the one that was authorized';
  }
  return undefined;
}

export interface SecurityAuthorizationAddOptions {
  readonly path?: string;
}

export interface SecurityAuthorizationAddResult {
  readonly authorizationPath: RelativePath;
  readonly checks: readonly string[];
  readonly environment: string;
}

/**
 * Validates an audit authorization a human or agent drafted as JSON and registers it at
 * `artifacts/security/authorization.json`. Registering is not consent: the operator approves it
 * separately (`runSecurityAuthorizationApprove`). It is checked against the live configuration
 * here so the operator is asked to approve what the audit will actually do: security testing in
 * scope, the environment's address and allowlist exactly as configured, every identity real.
 */
export async function runSecurityAuthorizationAdd(
  context: EngineContext,
  options: SecurityAuthorizationAddOptions,
): Promise<SecurityAuthorizationAddResult> {
  if (options.path === undefined) {
    throw new QaError('SECURITY_AUTHORIZATION_USAGE', 'Usage: qa security authorize --path <path>', {
      remediation: 'Example: qa security authorize --path security/authorization.json',
    });
  }
  const path = assertRelativePath(options.path);
  const absolutePath = resolveRelativePath(context.projectRoot, path);
  if (!(await context.fs.pathExists(absolutePath))) {
    throw new QaError('SECURITY_AUTHORIZATION_FILE_NOT_FOUND', `"${path}" does not exist`, {
      remediation: 'Check --path points at a real, readable file relative to the project root.',
    });
  }
  const authorization = await readJsonFile(context.fs, absolutePath, SecurityAuthorizationSchema);

  const config = await loadConfig(context);
  assertSecurityInScope(config);
  const mismatch = findEnvironmentMismatch(authorization, config);
  if (mismatch !== undefined) {
    throw new QaError(
      'SECURITY_AUTHORIZATION_ENVIRONMENT_MISMATCH',
      `The authorization does not match the configuration: ${mismatch}`,
      { remediation: 'Copy the environment name, baseUrl and allowlist from "qa config show".' },
    );
  }
  const unknownIdentities = authorization.identities
    .map((identity) => identity.name)
    .filter((name) => config.identities[name] === undefined);
  if (unknownIdentities.length > 0) {
    throw new QaError(
      'SECURITY_AUTHORIZATION_UNKNOWN_IDENTITY',
      `The authorization names identities that are not configured: ${unknownIdentities.join(', ')}`,
      { remediation: 'Add them with "qa config add identity", or remove them from the authorization.' },
    );
  }

  await openStores(context).authorizations.write(toCanonicalJson(authorization));
  return {
    authorizationPath: SECURITY_AUTHORIZATION_PATH,
    checks: authorization.checks,
    environment: authorization.environment.name,
  };
}

export interface SecurityAuthorizationApproveOptions {
  readonly approvedBy?: string;
  readonly note?: string;
}

export interface SecurityAuthorizationApproveResult {
  /** True when this exact content was already approved and nothing was recorded. */
  readonly wasAlreadyApproved: boolean;
}

/**
 * The audit-authorization gate (ADR-003): records the operator's approval bound to the SHA-256 of
 * the exact registered content. Editing the authorization afterwards withdraws the consent
 * (`assertSecurityAuthorized` refuses), so the operator never approves one thing and has the
 * audit run another.
 */
export async function runSecurityAuthorizationApprove(
  context: EngineContext,
  options: SecurityAuthorizationApproveOptions,
): Promise<SecurityAuthorizationApproveResult> {
  if (options.approvedBy === undefined) {
    throw new QaError(
      'SECURITY_AUTHORIZATION_APPROVE_USAGE',
      'Usage: qa security approve --approved-by <name>',
      {
        remediation: 'Example: qa security approve --approved-by operator',
      },
    );
  }
  const { ledger, authorizations } = openStores(context);
  if ((await authorizations.read()) === undefined) {
    throw new QaError('SECURITY_AUTHORIZATION_NOT_FOUND', 'No security authorization is registered', {
      remediation: 'Register one first with "qa security authorize --path <path>".',
    });
  }
  if (await authorizations.isApproved()) {
    return { wasAlreadyApproved: true };
  }

  // The approval hashes what is read back from disk, the bytes `isApproved` later compares (AGENTS.md 12.7).
  const approval: Approval = {
    gate: SECURITY_AUTHORIZATION_GATE,
    artifactPath: SECURITY_AUTHORIZATION_PATH,
    artifactSha256: hashText(await authorizations.readText()),
    approvedBy: options.approvedBy,
    approvedAt: context.clock.now().toISOString(),
    ...(options.note !== undefined ? { note: options.note } : {}),
  };
  await ledger.append(approval);
  return { wasAlreadyApproved: false };
}

/**
 * Returns the approved authorization, or refuses. Every audit starts here; nothing in the audit
 * can run without passing it. Four things must hold at the moment of the call: security testing
 * is in scope, an authorization is registered, the operator's approval hashes its current content,
 * and the live environment is still the one that was authorized.
 */
export async function assertSecurityAuthorized(context: EngineContext): Promise<SecurityAuthorization> {
  const config = await loadConfig(context);
  assertSecurityInScope(config);

  const { authorizations } = openStores(context);
  const authorization = await authorizations.read();
  if (authorization === undefined || !(await authorizations.isApproved())) {
    throw new QaError(
      'SECURITY_NOT_AUTHORIZED',
      authorization === undefined
        ? 'No security audit authorization is registered'
        : 'The security audit authorization is not approved, or was edited after it was',
      {
        remediation:
          'Register the authorization with "qa security authorize --path <path>", then approve it with "qa security approve --approved-by <name>".',
      },
    );
  }
  const mismatch = findEnvironmentMismatch(authorization, config);
  if (mismatch !== undefined) {
    throw new QaError(
      'SECURITY_AUTHORIZATION_STALE',
      `The approved authorization no longer matches the configuration: ${mismatch}`,
      { remediation: 'Register and approve a new authorization for the environment as it is now.' },
    );
  }
  return authorization;
}
