// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  SCHEMA_VERSION,
  type Approval,
  type GateState,
  type PhaseName,
  type PipelineState,
  type RelativePath,
} from '@qa-ai-stlc/schemas';
import type { ApprovalLedgerStore } from './approval-ledger-store.js';
import { QaError } from './errors.js';
import { hashText } from './hash.js';
import type { ManifestStore } from './manifest-store.js';
import { PHASES } from './phases.js';
import { systemClock, type Clock } from './ports/clock.js';
import type { QaStore } from './qa-store.js';
import type { PipelineStateStore } from './state-store.js';

export interface GateStateMachineOptions {
  readonly store: QaStore;
  readonly stateStore: PipelineStateStore;
  readonly ledger: ApprovalLedgerStore;
  readonly manifest: ManifestStore;
  readonly clock?: Clock;
}

export interface ApproveGateOptions {
  readonly gate: PhaseName;
  readonly artifactPath: RelativePath;
  readonly approvedBy: string;
  readonly note?: string;
}

type CanonicalArtifactBinding =
  | { readonly kind: 'exact'; readonly path: RelativePath }
  | { readonly kind: 'prefix'; readonly prefix: RelativePath };

/**
 * What "the artifact for this gate" means (#305): `scope` is always the single scope artifact;
 * `cases` has no single file yet (each case is its own `artifacts/cases/<feature>/<id>.json`,
 * P2-20), so any path under that directory counts. Either way, approving one gate can never bind
 * to an artifact that belongs to a different gate.
 */
const CANONICAL_ARTIFACT_BINDINGS: Record<PhaseName, CanonicalArtifactBinding> = {
  scope: { kind: 'exact', path: 'artifacts/scope.json' },
  cases: { kind: 'prefix', prefix: 'artifacts/cases/' },
};

function matchesCanonicalArtifactPath(gate: PhaseName, artifactPath: RelativePath): boolean {
  const binding = CANONICAL_ARTIFACT_BINDINGS[gate];
  return binding.kind === 'exact' ? artifactPath === binding.path : artifactPath.startsWith(binding.prefix);
}

function describeCanonicalArtifactPath(gate: PhaseName): string {
  const binding = CANONICAL_ARTIFACT_BINDINGS[gate];
  return binding.kind === 'exact' ? binding.path : `${binding.prefix}*`;
}

/**
 * The v0 pipeline state machine (development plan section 2.7, 8; ADR-003): `scope` then `cases`,
 * approved in order, each gate bound to the SHA-256 of the exact artifact content it approves.
 * `state.json` (`PipelineStateStore`) is always recomputed from the approval ledger and the
 * artifacts it references, never trusted as a cached status on its own — editing an approved
 * artifact reopens its gate the next time `approve()` or `validate()` runs, with no separate
 * tamper check required. `approve()` only ever binds to an artifact the engine itself registered
 * in the manifest (#278) — a path that merely exists cannot be approved — and only to the
 * artifact that actually belongs to the gate being approved (#305), not any other registered path.
 */
export class GateStateMachine {
  private readonly store: QaStore;
  private readonly stateStore: PipelineStateStore;
  private readonly ledger: ApprovalLedgerStore;
  private readonly manifest: ManifestStore;
  private readonly clock: Clock;

  constructor(options: GateStateMachineOptions) {
    this.store = options.store;
    this.stateStore = options.stateStore;
    this.ledger = options.ledger;
    this.manifest = options.manifest;
    this.clock = options.clock ?? systemClock;
  }

  /**
   * Hashes `artifactPath`'s current content and appends an approval for `gate` to the ledger.
   * Phases approve in order: approving a later phase while an earlier one is still open throws
   * `GATE_OUT_OF_ORDER`. Re-approving an already-satisfied gate is always allowed and simply
   * appends a new ledger entry, since the ledger is an audit trail, not a single current value.
   */
  async approve(options: ApproveGateOptions): Promise<PipelineState> {
    const state = await this.recomputeState();
    const gateIndex = PHASES.indexOf(options.gate);
    const currentIndex = PHASES.indexOf(state.currentPhase);
    if (gateIndex > currentIndex) {
      throw new QaError(
        'GATE_OUT_OF_ORDER',
        `Cannot approve "${options.gate}" before "${state.currentPhase}" is satisfied`,
        { remediation: `Approve phases in order: ${PHASES.join(' -> ')}.` },
      );
    }

    if (!matchesCanonicalArtifactPath(options.gate, options.artifactPath)) {
      throw new QaError(
        'GATE_ARTIFACT_PATH_MISMATCH',
        `"${options.artifactPath}" is not the artifact for the "${options.gate}" gate`,
        { remediation: `Approve "${options.gate}" with an artifact at ${describeCanonicalArtifactPath(options.gate)}.` },
      );
    }

    const exists = await this.store.pathExists(options.artifactPath);
    if (!exists) {
      throw new QaError(
        'GATE_ARTIFACT_MISSING',
        `No artifact found at "${options.artifactPath}" to approve`,
        {
          remediation: 'Generate the artifact before approving its gate.',
        },
      );
    }
    const content = await this.store.readText(options.artifactPath);
    // A gate binds to what the engine actually wrote, not to whatever file happens to sit at this
    // path (#278) — an unregistered or hand-edited artifact throws ARTIFACT_UNREGISTERED /
    // ARTIFACT_HASH_MISMATCH here instead of being approved.
    await this.manifest.assertRegistered(options.artifactPath, content);

    const approval: Approval = {
      gate: options.gate,
      artifactPath: options.artifactPath,
      artifactSha256: hashText(content),
      approvedBy: options.approvedBy,
      approvedAt: this.clock.now().toISOString(),
      ...(options.note !== undefined ? { note: options.note } : {}),
    };
    await this.ledger.append(approval);

    return this.recomputeState();
  }

  /**
   * Recomputes every gate's status from the approval ledger and each approved artifact's current
   * content, persists the refreshed `state.json`, and returns it. Reports no more and no less
   * than `approve()` already recomputes after every call — the two share this method so there is
   * one place, not two, that decides what "satisfied" means.
   */
  async validate(): Promise<PipelineState> {
    return this.recomputeState();
  }

  private async recomputeState(): Promise<PipelineState> {
    const gates = {} as Record<PhaseName, GateState>;
    for (const phase of PHASES) {
      gates[phase] = await this.recomputeGate(phase);
    }

    // The first not-yet-satisfied phase in order; if every phase is satisfied, the loop runs to
    // the end without breaking and `currentPhase` is left at the last one — v0 has nothing after
    // it yet, so it stays "current" rather than needing a distinct "done" phase.
    let currentPhase: PhaseName = PHASES[0];
    for (const phase of PHASES) {
      currentPhase = phase;
      if (gates[phase].status !== 'satisfied') {
        break;
      }
    }

    const state: PipelineState = { schemaVersion: SCHEMA_VERSION, currentPhase, gates };
    await this.stateStore.save(state);
    return state;
  }

  private async recomputeGate(phase: PhaseName): Promise<GateState> {
    const approval = await this.ledger.latestForGate(phase);
    if (approval === undefined) {
      return { status: 'open' };
    }
    const artifactExists = await this.store.pathExists(approval.artifactPath);
    /* v8 ignore next 3 -- FileSystem (ports/file-system.ts) has no delete operation, so a
       registered artifact disappearing between approval and validation cannot be constructed by a
       test today; kept so a manually deleted file reads as a reopened gate, not a thrown ENOENT. */
    if (!artifactExists) {
      return { status: 'open' };
    }
    const content = await this.store.readText(approval.artifactPath);
    return { status: hashText(content) === approval.artifactSha256 ? 'satisfied' : 'open' };
  }
}
