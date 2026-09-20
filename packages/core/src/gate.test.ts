// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ApprovalLedgerStore } from './approval-ledger-store.js';
import { QaError } from './errors.js';
import { GateStateMachine } from './gate.js';
import { hashText } from './hash.js';
import type { Clock } from './ports/clock.js';
import { QaStore } from './qa-store.js';
import { PipelineStateStore } from './state-store.js';
import { createFakeFileSystem } from './test-support/fake-file-system.js';

const FIXED_TIME = new Date('2026-09-20T12:00:00.000Z');
const fixedClock: Clock = { now: () => FIXED_TIME };

function createGateStateMachine(): { store: QaStore; gates: GateStateMachine } {
  const store = new QaStore({ projectRoot: join('project'), fs: createFakeFileSystem() });
  const gates = new GateStateMachine({
    store,
    stateStore: new PipelineStateStore({ store }),
    ledger: new ApprovalLedgerStore({ store }),
    clock: fixedClock,
  });
  return { store, gates };
}

describe('GateStateMachine', () => {
  it('approves the current phase and advances to the next one', async () => {
    const { store, gates } = createGateStateMachine();
    await store.writeJson('artifacts/scope.json', { requirements: [] });

    const state = await gates.approve({
      gate: 'scope',
      artifactPath: 'artifacts/scope.json',
      approvedBy: 'operator',
    });

    expect(state.gates.scope.status).toBe('satisfied');
    expect(state.gates.cases.status).toBe('open');
    expect(state.currentPhase).toBe('cases');
  });

  it('advances through every phase and stays at the last one once all gates are satisfied', async () => {
    const { store, gates } = createGateStateMachine();
    await store.writeJson('artifacts/scope.json', { requirements: [] });
    await store.writeJson('artifacts/cases.json', { cases: [] });
    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });

    const state = await gates.approve({
      gate: 'cases',
      artifactPath: 'artifacts/cases.json',
      approvedBy: 'operator',
    });

    expect(state.gates.scope.status).toBe('satisfied');
    expect(state.gates.cases.status).toBe('satisfied');
    expect(state.currentPhase).toBe('cases');
  });

  it('rejects approving a later phase while an earlier one is still open', async () => {
    const { store, gates } = createGateStateMachine();
    await store.writeJson('artifacts/cases.json', { cases: [] });

    const error = await gates
      .approve({ gate: 'cases', artifactPath: 'artifacts/cases.json', approvedBy: 'operator' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('GATE_OUT_OF_ORDER');
  });

  it('rejects approving a gate whose artifact does not exist yet', async () => {
    const { gates } = createGateStateMachine();

    const error = await gates
      .approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('GATE_ARTIFACT_MISSING');
  });

  // The issue's own acceptance criterion (P2-01): editing an approved artifact reopens its gate.
  it('reopens a satisfied gate when its approved artifact is edited afterward', async () => {
    const { store, gates } = createGateStateMachine();
    await store.writeJson('artifacts/scope.json', { requirements: [] });
    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });

    await store.writeJson('artifacts/scope.json', { requirements: [{ id: 'R1' }] });
    const state = await gates.validate();

    expect(state.gates.scope.status).toBe('open');
    expect(state.currentPhase).toBe('scope');
  });

  it('persists the recomputed state to state.json on every validate() call', async () => {
    const { store, gates } = createGateStateMachine();
    await store.writeJson('artifacts/scope.json', { requirements: [] });
    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });

    const persisted = await new PipelineStateStore({ store }).load();

    expect(persisted.gates.scope.status).toBe('satisfied');
    expect(persisted.currentPhase).toBe('cases');
  });

  it('re-approving an already-satisfied gate appends a new ledger entry rather than replacing the old one', async () => {
    const { store, gates } = createGateStateMachine();
    await store.writeJson('artifacts/scope.json', { requirements: [] });
    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });

    await gates.approve({
      gate: 'scope',
      artifactPath: 'artifacts/scope.json',
      approvedBy: 'operator',
      note: 're-confirmed',
    });

    const ledger = await new ApprovalLedgerStore({ store }).load();
    expect(ledger.approvals.filter((approval) => approval.gate === 'scope')).toHaveLength(2);
  });

  it('binds the approval to the exact artifact content hash', async () => {
    const { store, gates } = createGateStateMachine();
    const content = JSON.stringify({ requirements: [] });
    await store.writeText('artifacts/scope.json', content);

    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });

    const ledger = await new ApprovalLedgerStore({ store }).load();
    expect(ledger.approvals[0]?.artifactSha256).toBe(hashText(content));
    expect(ledger.approvals[0]?.approvedAt).toBe(FIXED_TIME.toISOString());
  });

  it('defaults to the system clock when none is provided', async () => {
    const store = new QaStore({ projectRoot: join('project'), fs: createFakeFileSystem() });
    const gates = new GateStateMachine({
      store,
      stateStore: new PipelineStateStore({ store }),
      ledger: new ApprovalLedgerStore({ store }),
    });
    await store.writeJson('artifacts/scope.json', { requirements: [] });

    const before = Date.now();
    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });
    const after = Date.now();

    const ledger = await new ApprovalLedgerStore({ store }).load();
    const approvedAt = new Date(ledger.approvals[0]?.approvedAt ?? '').getTime();
    expect(approvedAt).toBeGreaterThanOrEqual(before);
    expect(approvedAt).toBeLessThanOrEqual(after);
  });
});
