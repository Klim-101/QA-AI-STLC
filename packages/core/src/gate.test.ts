// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ApprovalLedgerStore } from './approval-ledger-store.js';
import { QaError } from './errors.js';
import { GateStateMachine } from './gate.js';
import { hashText } from './hash.js';
import { toCanonicalJson } from './json-file.js';
import { ManifestStore } from './manifest-store.js';
import type { Clock } from './ports/clock.js';
import { QaStore } from './qa-store.js';
import { PipelineStateStore } from './state-store.js';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';

const FIXED_TIME = new Date('2026-09-20T12:00:00.000Z');
const fixedClock: Clock = { now: () => FIXED_TIME };

function createGateStateMachine(): { store: QaStore; manifest: ManifestStore; gates: GateStateMachine } {
  const store = new QaStore({ projectRoot: join('project'), fs: createFakeFileSystem() });
  const manifest = new ManifestStore({ store, clock: fixedClock });
  const gates = new GateStateMachine({
    store,
    stateStore: new PipelineStateStore({ store }),
    ledger: new ApprovalLedgerStore({ store, manifest }),
    manifest,
    clock: fixedClock,
  });
  return { store, manifest, gates };
}

/** Writes `value` as canonical JSON and registers it in the manifest, the way a real engine
 * operation (`qa scope`, `qa cases add`) does before a gate can ever approve it. */
async function writeAndRegister(
  store: QaStore,
  manifest: ManifestStore,
  path: string,
  value: unknown,
): Promise<void> {
  const serialized = toCanonicalJson(value);
  await store.writeText(path, serialized);
  await manifest.register(path, serialized);
}

describe('GateStateMachine', () => {
  it('approves the current phase and advances to the next one', async () => {
    const { store, manifest, gates } = createGateStateMachine();
    await writeAndRegister(store, manifest, 'artifacts/scope.json', { requirements: [] });

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
    const { store, manifest, gates } = createGateStateMachine();
    await writeAndRegister(store, manifest, 'artifacts/scope.json', { requirements: [] });
    await writeAndRegister(store, manifest, 'artifacts/cases/checkout/case-1.json', { id: 'case-1' });
    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });

    const state = await gates.approve({
      gate: 'cases',
      artifactPath: 'artifacts/cases/checkout/case-1.json',
      approvedBy: 'operator',
    });

    expect(state.gates.scope.status).toBe('satisfied');
    expect(state.gates.cases.status).toBe('satisfied');
    expect(state.currentPhase).toBe('cases');
  });

  it('rejects approving a later phase while an earlier one is still open', async () => {
    const { store, manifest, gates } = createGateStateMachine();
    await writeAndRegister(store, manifest, 'artifacts/cases.json', { cases: [] });

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

  it('rejects approving an artifact that exists on disk but was never registered in the manifest (regression, #278)', async () => {
    const { store, gates } = createGateStateMachine();
    // Written directly, bypassing every engine operation that would normally register it.
    await store.writeJson('artifacts/scope.json', { requirements: [] });

    const error = await gates
      .approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('ARTIFACT_UNREGISTERED');
  });

  it('rejects approving an artifact hand-edited after registration but before approval (regression, #278)', async () => {
    const { store, manifest, gates } = createGateStateMachine();
    await writeAndRegister(store, manifest, 'artifacts/scope.json', { requirements: [] });
    // Forged: content changed without going through an engine operation that re-registers it.
    await store.writeJson('artifacts/scope.json', { requirements: [{ id: 'forged' }] });

    const error = await gates
      .approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('ARTIFACT_HASH_MISMATCH');
  });

  it('rejects approving a gate with a registered artifact that belongs to a different gate (regression, #305)', async () => {
    const { store, manifest, gates } = createGateStateMachine();
    // Registered, but through no operation of the "scope" gate — the issue's own repro.
    await writeAndRegister(store, manifest, 'artifacts/unrelated.json', { anything: true });

    const error = await gates
      .approve({ gate: 'scope', artifactPath: 'artifacts/unrelated.json', approvedBy: 'operator' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('GATE_ARTIFACT_PATH_MISMATCH');
  });

  it('rejects approving the cases gate with the scope artifact, even though both are registered (regression, #305)', async () => {
    const { store, manifest, gates } = createGateStateMachine();
    await writeAndRegister(store, manifest, 'artifacts/scope.json', { requirements: [] });
    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });

    const error = await gates
      .approve({ gate: 'cases', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('GATE_ARTIFACT_PATH_MISMATCH');
  });

  it('accepts any registered artifact under artifacts/cases/ for the cases gate', async () => {
    const { store, manifest, gates } = createGateStateMachine();
    await writeAndRegister(store, manifest, 'artifacts/scope.json', { requirements: [] });
    await writeAndRegister(store, manifest, 'artifacts/cases/checkout/case-1.json', { id: 'case-1' });
    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });

    const state = await gates.approve({
      gate: 'cases',
      artifactPath: 'artifacts/cases/checkout/case-1.json',
      approvedBy: 'operator',
    });

    expect(state.gates.cases.status).toBe('satisfied');
  });

  it('ignores a hand-forged approval ledger on a project with no prior approvals (regression, #304)', async () => {
    const { store, gates } = createGateStateMachine();
    // Both files written directly, bypassing every engine operation — including the artifact
    // that #278 already guards against unregistered content, so only the ledger's own
    // registration is under test here.
    const scope = { requirements: [] };
    await store.writeJson('artifacts/scope.json', scope);
    await store.writeJson('artifacts/approval-ledger.json', {
      schemaVersion: 1,
      approvals: [
        {
          gate: 'scope',
          artifactPath: 'artifacts/scope.json',
          artifactSha256: hashText(toCanonicalJson(scope)),
          approvedBy: 'attacker',
          approvedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const state = await gates.validate();

    expect(state.gates.scope.status).toBe('open');
    expect(state.currentPhase).toBe('scope');
  });

  // The issue's own acceptance criterion (P2-01): editing an approved artifact reopens its gate.
  it('reopens a satisfied gate when its approved artifact is edited afterward', async () => {
    const { store, manifest, gates } = createGateStateMachine();
    await writeAndRegister(store, manifest, 'artifacts/scope.json', { requirements: [] });
    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });

    await store.writeJson('artifacts/scope.json', { requirements: [{ id: 'R1' }] });
    const state = await gates.validate();

    expect(state.gates.scope.status).toBe('open');
    expect(state.currentPhase).toBe('scope');
  });

  it('persists the recomputed state to state.json on every validate() call', async () => {
    const { store, manifest, gates } = createGateStateMachine();
    await writeAndRegister(store, manifest, 'artifacts/scope.json', { requirements: [] });
    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });

    const persisted = await new PipelineStateStore({ store }).load();

    expect(persisted.gates.scope.status).toBe('satisfied');
    expect(persisted.currentPhase).toBe('cases');
  });

  it('re-approving an already-satisfied gate appends a new ledger entry rather than replacing the old one', async () => {
    const { store, manifest, gates } = createGateStateMachine();
    await writeAndRegister(store, manifest, 'artifacts/scope.json', { requirements: [] });
    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });

    await gates.approve({
      gate: 'scope',
      artifactPath: 'artifacts/scope.json',
      approvedBy: 'operator',
      note: 're-confirmed',
    });

    const ledger = await new ApprovalLedgerStore({ store, manifest }).load();
    expect(ledger.approvals.filter((approval) => approval.gate === 'scope')).toHaveLength(2);
  });

  it('binds the approval to the exact artifact content hash', async () => {
    const { store, manifest, gates } = createGateStateMachine();
    const content = JSON.stringify({ requirements: [] });
    await store.writeText('artifacts/scope.json', content);
    await manifest.register('artifacts/scope.json', content);

    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });

    const ledger = await new ApprovalLedgerStore({ store, manifest }).load();
    expect(ledger.approvals[0]?.artifactSha256).toBe(hashText(content));
    expect(ledger.approvals[0]?.approvedAt).toBe(FIXED_TIME.toISOString());
  });

  it('defaults to the system clock when none is provided', async () => {
    const store = new QaStore({ projectRoot: join('project'), fs: createFakeFileSystem() });
    const manifest = new ManifestStore({ store });
    const gates = new GateStateMachine({
      store,
      stateStore: new PipelineStateStore({ store }),
      ledger: new ApprovalLedgerStore({ store, manifest }),
      manifest,
    });
    await writeAndRegister(store, manifest, 'artifacts/scope.json', { requirements: [] });

    const before = Date.now();
    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });
    const after = Date.now();

    const ledger = await new ApprovalLedgerStore({ store, manifest }).load();
    const approvedAt = new Date(ledger.approvals[0]?.approvedAt ?? '').getTime();
    expect(approvedAt).toBeGreaterThanOrEqual(before);
    expect(approvedAt).toBeLessThanOrEqual(after);
  });
});
