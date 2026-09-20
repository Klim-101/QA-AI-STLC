// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  ApprovalLedgerStore,
  GateStateMachine,
  PHASES,
  PipelineStateStore,
  QaStore,
  findUnlinkedRequirementIds,
} from '@qa-ai-stlc/core';
import {
  SCHEMA_VERSION,
  ScopeSchema,
  TestCaseSchema,
  type PhaseName,
  type PipelineState,
  type Scope,
} from '@qa-ai-stlc/schemas';
import type { CommandContext } from '../command-context.js';

const SCOPE_PATH = 'artifacts/scope.json';
const CASES_DIR = 'artifacts/cases';

export interface UnlinkedCase {
  readonly casePath: string;
  readonly id: string;
  readonly unlinkedRequirementIds: readonly string[];
}

export interface ValidateReport {
  readonly state: PipelineState;
  /**
   * Phases with a recorded approval whose artifact no longer matches it — real tampering or an
   * edit after approval, distinct from a phase that was simply never approved yet (also reported
   * as `open`, but not here, and not a failure).
   */
  readonly reopened: readonly PhaseName[];
  /** Every registered test case with at least one `requirementIds` entry not in the scope artifact. */
  readonly unlinkedCases: readonly UnlinkedCase[];
}

/**
 * `qa validate` (P2-01, ADR-003; P2-03 traceability): recomputes every gate's status from the
 * approval ledger and each approved artifact's current content, persists the refreshed
 * `state.json`, and separately re-checks every registered test case's requirement links against
 * the current scope artifact — `qa cases add` (P2-03) checks this once at registration time, this
 * catches a link broken later by editing `scope.json`. The CLI's exit code is nonzero for a
 * reopened gate or any unlinked case, never for a phase simply not yet approved.
 */
export async function runValidate(context: CommandContext): Promise<ValidateReport> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const ledger = new ApprovalLedgerStore({ store });
  const gates = new GateStateMachine({
    store,
    stateStore: new PipelineStateStore({ store }),
    ledger,
    clock: context.clock,
  });

  const state = await gates.validate();
  const reopened: PhaseName[] = [];
  for (const phase of PHASES) {
    if (state.gates[phase].status !== 'open') {
      continue;
    }
    const approval = await ledger.latestForGate(phase);
    if (approval !== undefined) {
      reopened.push(phase);
    }
  }

  const unlinkedCases = await findUnlinkedCases(context, store);

  return { state, reopened, unlinkedCases };
}

async function findUnlinkedCases(context: CommandContext, store: QaStore): Promise<readonly UnlinkedCase[]> {
  const casesDirAbsolute = store.resolve(CASES_DIR);
  const caseFiles = await context.fs.listFiles(casesDirAbsolute);
  if (caseFiles.length === 0) {
    return [];
  }

  const scope = await loadScope(store);
  const unlinkedCases: UnlinkedCase[] = [];
  for (const absolutePath of [...caseFiles].sort()) {
    const relativePath = store.toRelativePath(absolutePath);
    const testCase = await store.readJson(relativePath, TestCaseSchema);
    const unlinkedRequirementIds = findUnlinkedRequirementIds(testCase.requirementIds, scope);
    if (unlinkedRequirementIds.length > 0) {
      unlinkedCases.push({ casePath: relativePath, id: testCase.id, unlinkedRequirementIds });
    }
  }
  return unlinkedCases;
}

async function loadScope(store: QaStore): Promise<Scope> {
  const exists = await store.pathExists(SCOPE_PATH);
  if (!exists) {
    return { schemaVersion: SCHEMA_VERSION, generatedAt: new Date(0).toISOString(), requirements: [] };
  }
  return store.readJson(SCOPE_PATH, ScopeSchema);
}
