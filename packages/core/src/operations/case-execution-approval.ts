// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { CasesIndexSchema } from '@qa-ai-stlc/schemas';
import { ApprovalLedgerStore } from '../approval-ledger-store.js';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { CASES_INDEX_PATH, GateStateMachine } from '../gate.js';
import { hashText } from '../hash.js';
import { ManifestStore } from '../manifest-store.js';
import { PHASES } from '../phases.js';
import { QaStore } from '../qa-store.js';
import { PipelineStateStore } from '../state-store.js';
import { findCasePath } from './cases-render.js';

/**
 * Throws unless `caseId` is a registered case that the operator approved: every gate is satisfied
 * and the approved case set lists the case's file under the hash it has now (ADR-0009, ADR-003).
 * Checking the file against the approved snapshot, not only the gate, catches a case edited after
 * approval whose snapshot was never regenerated, which would leave the gate satisfied.
 */
export async function assertCaseApprovedForExecution(context: EngineContext, caseId: string): Promise<void> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const gates = new GateStateMachine({
    store,
    stateStore: new PipelineStateStore({ store }),
    ledger: new ApprovalLedgerStore({ store, manifest }),
    manifest,
    configSource: context,
    clock: context.clock,
  });
  const casePath = await findCasePath(store, caseId);

  const state = await gates.validate();
  const openGate = PHASES.find((phase) => state.gates[phase].status !== 'satisfied');
  if (openGate !== undefined) {
    throw notApproved(caseId, `the "${openGate}" gate is not approved`);
  }

  const approvedSet = await store.readJson(CASES_INDEX_PATH, CasesIndexSchema);
  const approvedFile = approvedSet.files.find((file) => file.path === casePath);
  if (approvedFile === undefined) {
    throw notApproved(caseId, 'it is not in the approved case set');
  }
  if (approvedFile.sha256 !== hashText(await store.readText(casePath))) {
    throw notApproved(caseId, 'it was edited after the case set was approved');
  }
}

function notApproved(caseId: string, reason: string): QaError {
  return new QaError(
    'EXECUTION_CASE_NOT_APPROVED',
    `Case "${caseId}" cannot be executed with real requests: ${reason}`,
    {
      remediation:
        'Review the case set and approve the "cases" gate (qa approve cases), then open the session again with the same caseId.',
    },
  );
}
