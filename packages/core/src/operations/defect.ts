// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  DefectDraftSchema,
  SCHEMA_VERSION,
  ScopeSchema,
  type Approval,
  type DefectStatus,
  type Scope,
} from '@qa-ai-stlc/schemas';
import { ApprovalLedgerStore } from '../approval-ledger-store.js';
import { DefectStore, defectGate, defectPath } from '../defect-store.js';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { hashText } from '../hash.js';
import { readJsonFile, toCanonicalJson } from '../json-file.js';
import { ManifestStore } from '../manifest-store.js';
import { assertRelativePath, resolveRelativePath } from '../paths.js';
import { QaStore } from '../qa-store.js';
import { findUnlinkedRequirementIds } from '../requirement-linking.js';

const SCOPE_PATH = 'artifacts/scope.json';

function openStores(context: EngineContext): {
  readonly store: QaStore;
  readonly manifest: ManifestStore;
  readonly ledger: ApprovalLedgerStore;
  readonly defects: DefectStore;
} {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const ledger = new ApprovalLedgerStore({ store, manifest });
  return { store, manifest, ledger, defects: new DefectStore({ store, manifest, ledger }) };
}

export interface DefectAddOptions {
  readonly path?: string;
}

export interface DefectAddResult {
  readonly id: string;
  readonly defectPath: string;
  readonly requirementIds: readonly string[];
  readonly evidencePaths: readonly string[];
}

/**
 * `qa defect add --path <path>` / MCP `qa.defect_add` (P6-07): validates a defect draft a human or
 * the triage spoke wrote as JSON and registers it under `artifacts/defects/<id>.json`. A new draft
 * is always `draft`: acceptance is a separate, approved step (`runDefectAccept`), so a file that
 * arrives already claiming `accepted` is rejected. Every requirement it cites must exist in the
 * scope artifact and every evidence path must be a file the engine registered (AGENTS.md 12.5).
 * Re-adding replaces an unaccepted draft; an accepted one is never overwritten.
 */
export async function runDefectAdd(
  context: EngineContext,
  options: DefectAddOptions,
): Promise<DefectAddResult> {
  if (options.path === undefined) {
    throw new QaError('DEFECT_ADD_USAGE', 'Usage: qa defect add --path <path>', {
      remediation: 'Example: qa defect add --path defects/login-error.json',
    });
  }
  const path = assertRelativePath(options.path);
  const absolutePath = resolveRelativePath(context.projectRoot, path);
  if (!(await context.fs.pathExists(absolutePath))) {
    throw new QaError('DEFECT_ADD_FILE_NOT_FOUND', `"${path}" does not exist`, {
      remediation: 'Check --path points at a real, readable file relative to the project root.',
    });
  }
  const draft = await readJsonFile(context.fs, absolutePath, DefectDraftSchema);
  if (draft.status !== 'draft') {
    throw new QaError(
      'DEFECT_ADD_STATUS_INVALID',
      `Defect "${draft.id}" arrives with status "${draft.status}"; a new draft must be "draft"`,
      { remediation: 'Set "status" to "draft"; acceptance is recorded with "qa defect accept".' },
    );
  }

  const { manifest, defects } = openStores(context);
  if (await defects.exists(draft.id)) {
    const existing = await defects.read(draft.id);
    if ((await defects.resolveStatus(existing)) === 'accepted') {
      throw new QaError('DEFECT_ALREADY_ACCEPTED', `Defect "${draft.id}" is already accepted`, {
        remediation: 'An accepted draft is never overwritten; file a new draft with a different id.',
      });
    }
  }

  const scope = (await manifest.readVerified(SCOPE_PATH, ScopeSchema)) ?? emptyScope();
  const unlinked = findUnlinkedRequirementIds(draft.requirementIds, scope);
  if (unlinked.length > 0) {
    throw new QaError(
      'DEFECT_UNLINKED_REQUIREMENT',
      `Defect "${draft.id}" links to requirement(s) not in artifacts/scope.json: ${unlinked.join(', ')}`,
      {
        remediation: 'Run "qa scope" to register the requirement first, or fix the draft\'s requirementIds.',
      },
    );
  }

  const registered = (await manifest.load()).artifacts;
  const unregistered = draft.evidencePaths.filter((evidencePath) => registered[evidencePath] === undefined);
  if (unregistered.length > 0) {
    throw new QaError(
      'DEFECT_EVIDENCE_UNREGISTERED',
      `Defect "${draft.id}" cites evidence the engine did not register: ${unregistered.join(', ')}`,
      {
        remediation: 'Cite only evidence paths returned by engine tools; evidence is never created by hand.',
      },
    );
  }

  await defects.write(draft, toCanonicalJson(draft));
  return {
    id: draft.id,
    defectPath: defectPath(draft.id),
    requirementIds: draft.requirementIds,
    evidencePaths: draft.evidencePaths,
  };
}

function emptyScope(): Scope {
  return { schemaVersion: SCHEMA_VERSION, generatedAt: new Date(0).toISOString(), requirements: [] };
}

export interface DefectAcceptOptions {
  readonly id?: string;
  readonly approvedBy?: string;
  readonly note?: string;
}

export interface DefectAcceptResult {
  readonly id: string;
  readonly status: DefectStatus;
  /** True when the draft was already accepted and nothing was recorded. */
  readonly wasAlreadyAccepted: boolean;
}

/**
 * `qa defect accept <id> --approved-by <name>` / MCP `qa.defect_accept` (P6-07, ADR-003): the
 * defect-acceptance gate. Marks the draft `accepted`, then records an approval bound to the SHA-256
 * of the exact accepted content, so editing the draft afterwards makes it read as `draft` again
 * (`DefectStore.resolveStatus`). The draft must be one the engine registered and unmodified; a
 * rejected draft cannot be accepted.
 */
export async function runDefectAccept(
  context: EngineContext,
  options: DefectAcceptOptions,
): Promise<DefectAcceptResult> {
  if (options.id === undefined || options.approvedBy === undefined) {
    throw new QaError('DEFECT_ACCEPT_USAGE', 'Usage: qa defect accept <id> --approved-by <name>', {
      remediation: 'Example: qa defect accept login-error --approved-by operator',
    });
  }
  const { defects, ledger } = openStores(context);
  const draft = await defects.read(options.id);
  if (draft.status === 'rejected') {
    throw new QaError('DEFECT_REJECTED', `Defect "${draft.id}" was rejected and cannot be accepted`, {
      remediation: 'File a new draft instead.',
    });
  }
  if ((await defects.resolveStatus(draft)) === 'accepted') {
    return { id: draft.id, status: 'accepted', wasAlreadyAccepted: true };
  }

  // The approval hashes what is read back from disk, not what was serialized, so the bytes
  // approved are the bytes `resolveStatus` later compares (AGENTS.md 12.7).
  const accepted = { ...draft, status: 'accepted' as const };
  const content = await defects.write(accepted, toCanonicalJson(accepted));
  const approval: Approval = {
    gate: defectGate(draft.id),
    artifactPath: defectPath(draft.id),
    artifactSha256: hashText(content),
    approvedBy: options.approvedBy,
    approvedAt: context.clock.now().toISOString(),
    ...(options.note !== undefined ? { note: options.note } : {}),
  };
  await ledger.append(approval);

  return { id: draft.id, status: 'accepted', wasAlreadyAccepted: false };
}
