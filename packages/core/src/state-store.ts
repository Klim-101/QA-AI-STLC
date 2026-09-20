// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  PipelineStateSchema,
  SCHEMA_VERSION,
  type PipelineState,
  type RelativePath,
} from '@qa-ai-stlc/schemas';
import { PHASES } from './phases.js';
import type { QaStore } from './qa-store.js';

const STATE_PATH: RelativePath = 'state.json';

function initialState(): PipelineState {
  const firstPhase = PHASES[0];
  return {
    schemaVersion: SCHEMA_VERSION,
    currentPhase: firstPhase,
    gates: Object.fromEntries(
      PHASES.map((phase) => [phase, { status: 'open' as const }]),
    ) as PipelineState['gates'],
  };
}

export interface PipelineStateStoreOptions {
  readonly store: QaStore;
}

/**
 * `.qa/state.json`: a read-model, not a source of truth (ADR-003). `GateStateMachine` recomputes
 * it from the approval ledger and each approved artifact's current content on every `approve()`
 * and `validate()` call and writes the result here so other commands (`qa doctor`, a future MCP
 * tool) can read the current phase and gate statuses without recomputing hashes themselves.
 */
export class PipelineStateStore {
  private readonly store: QaStore;

  constructor(options: PipelineStateStoreOptions) {
    this.store = options.store;
  }

  async load(): Promise<PipelineState> {
    const exists = await this.store.pathExists(STATE_PATH);
    if (!exists) {
      return initialState();
    }
    return this.store.readJson(STATE_PATH, PipelineStateSchema);
  }

  async save(state: PipelineState): Promise<void> {
    await this.store.writeJson(STATE_PATH, state);
  }
}
