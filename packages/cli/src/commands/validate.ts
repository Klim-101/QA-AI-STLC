// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { ApprovalLedgerStore, GateStateMachine, PHASES, PipelineStateStore, QaStore } from '@qa-ai-stlc/core';
import type { PhaseName, PipelineState } from '@qa-ai-stlc/schemas';
import type { CommandContext } from '../command-context.js';

export interface ValidateReport {
  readonly state: PipelineState;
  /**
   * Phases with a recorded approval whose artifact no longer matches it — real tampering or an
   * edit after approval, distinct from a phase that was simply never approved yet (also reported
   * as `open`, but not here, and not a failure).
   */
  readonly reopened: readonly PhaseName[];
}

/**
 * `qa validate` (P2-01, ADR-003): recomputes every gate's status from the approval ledger and
 * each approved artifact's current content, persists the refreshed `state.json`, and reports
 * which gates specifically reopened since their last approval — the CLI's exit code is nonzero
 * only for those, not for a phase still awaiting its first approval.
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

  return { state, reopened };
}
