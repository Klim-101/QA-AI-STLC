// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { PhaseNameSchema, RelativePathSchema, type PhaseName, type PipelineState } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { ApprovalLedgerStore } from '../approval-ledger-store.js';
import { GateStateMachine } from '../gate.js';
import { ManifestStore } from '../manifest-store.js';
import { PHASES } from '../phases.js';
import { QaStore } from '../qa-store.js';
import { PipelineStateStore } from '../state-store.js';

export interface ApproveOptions {
  readonly gate: string;
  readonly artifactPath: string;
  readonly approvedBy: string;
  readonly note?: string;
}

export interface ApproveResult {
  readonly gate: PhaseName;
  readonly state: PipelineState;
}

/**
 * `qa approve <gate>` / MCP `qa_approve` (P2-01, P2-05, ADR-003): hashes the artifact's current
 * content and records the approval, advancing the pipeline to the next phase when `gate` is the
 * current one. Validates `gate` and the artifact path against their schemas here so
 * `GateStateMachine` never sees a malformed value; phase-order and missing-artifact errors come
 * from there unchanged.
 */
export async function runApprove(context: EngineContext, options: ApproveOptions): Promise<ApproveResult> {
  const gate = PhaseNameSchema.safeParse(options.gate);
  if (!gate.success) {
    throw new QaError('APPROVE_GATE_UNKNOWN', `"${options.gate}" is not a known gate`, {
      remediation: `Use one of: ${PHASES.join(', ')}.`,
    });
  }
  const artifactPath = RelativePathSchema.safeParse(options.artifactPath);
  if (!artifactPath.success) {
    throw new QaError(
      'APPROVE_ARTIFACT_PATH_INVALID',
      `"${options.artifactPath}" is not a valid artifact path:\n${z.prettifyError(artifactPath.error)}`,
      { remediation: 'Use a project-relative, forward-slash path with no ".." segments.' },
    );
  }

  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const gates = new GateStateMachine({
    store,
    stateStore: new PipelineStateStore({ store }),
    ledger: new ApprovalLedgerStore({ store, manifest }),
    manifest,
    clock: context.clock,
  });

  const state = await gates.approve({
    gate: gate.data,
    artifactPath: artifactPath.data,
    approvedBy: options.approvedBy,
    ...(options.note !== undefined ? { note: options.note } : {}),
  });

  return { gate: gate.data, state };
}
