// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ApprovalLedgerStore } from './approval-ledger-store.js';
import { QaError } from './errors.js';
import { CASES_INDEX_PATH, GateStateMachine } from './gate.js';
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

/** A minimal valid `config.yaml`, with `testing` set to `testingLine` (the block's inner text). */
function configYaml(testingLine: string): string {
  return [
    'schemaVersion: 1',
    `testing: { ${testingLine} }`,
    'environments:',
    '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
    'identities:',
    '  admin: { auth: cdp-attach, secret: QA_ADMIN_PASSWORD }',
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
    'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
    '',
  ].join('\n');
}

// e2e in-scope, everything else out-of-scope, so a single e2e case satisfies "one case set per
// in-scope type" (P2-16) without needing an `api` config block too.
const CONFIG_YAML = configYaml(
  'e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope',
);

/** Writes and registers `config.yaml`, defaulting to `testing.e2e` as the only in-scope type. */
async function writeAndRegisterConfig(
  store: QaStore,
  manifest: ManifestStore,
  yaml: string = CONFIG_YAML,
): Promise<void> {
  await store.writeText('config.yaml', yaml);
  await manifest.register('config.yaml', yaml);
}

function validCase(overrides: { id?: string; feature?: string } = {}): unknown {
  return {
    id: overrides.id ?? 'case-1',
    feature: overrides.feature ?? 'checkout',
    requirementIds: ['r1'],
    testType: 'e2e',
    title: 'A case',
    steps: [{ description: 'Do something' }],
    expectedResult: 'Something happens',
    status: 'draft',
    createdAt: '2026-09-20T12:00:00Z',
  };
}

/** The `cases` gate's aggregate snapshot (#357) for the given already-registered case file paths. */
function casesIndex(files: readonly { path: string; content: unknown }[]): unknown {
  return {
    files: files.map(({ path, content }) => ({ path, sha256: hashText(toCanonicalJson(content)) })),
  };
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
    await writeAndRegisterConfig(store, manifest);
    await writeAndRegister(store, manifest, 'artifacts/scope.json', { requirements: [] });
    await writeAndRegister(store, manifest, 'artifacts/cases/checkout/case-1.json', validCase());
    await writeAndRegister(
      store,
      manifest,
      CASES_INDEX_PATH,
      casesIndex([{ path: 'artifacts/cases/checkout/case-1.json', content: validCase() }]),
    );
    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });

    const state = await gates.approve({
      gate: 'cases',
      artifactPath: CASES_INDEX_PATH,
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

  it('accepts the case-set aggregate for the cases gate', async () => {
    const { store, manifest, gates } = createGateStateMachine();
    await writeAndRegisterConfig(store, manifest);
    await writeAndRegister(store, manifest, 'artifacts/scope.json', { requirements: [] });
    await writeAndRegister(store, manifest, 'artifacts/cases/checkout/case-1.json', validCase());
    await writeAndRegister(
      store,
      manifest,
      CASES_INDEX_PATH,
      casesIndex([{ path: 'artifacts/cases/checkout/case-1.json', content: validCase() }]),
    );
    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });

    const state = await gates.approve({
      gate: 'cases',
      artifactPath: CASES_INDEX_PATH,
      approvedBy: 'operator',
    });

    expect(state.gates.cases.status).toBe('satisfied');
  });

  // Regression, #357: a single case file is one of many files that make up the case set, so
  // binding the gate to it directly (the old "any path under artifacts/cases/" behavior removed
  // above) let approving one case's file stand in for the whole set.
  it('rejects approving cases with one case file directly, even though it is registered', async () => {
    const { store, manifest, gates } = createGateStateMachine();
    await writeAndRegisterConfig(store, manifest);
    await writeAndRegister(store, manifest, 'artifacts/scope.json', { requirements: [] });
    await writeAndRegister(store, manifest, 'artifacts/cases/checkout/case-1.json', validCase());
    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });

    const error = await gates
      .approve({
        gate: 'cases',
        artifactPath: 'artifacts/cases/checkout/case-1.json',
        approvedBy: 'operator',
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('GATE_ARTIFACT_PATH_MISMATCH');
  });

  // The issue's own repro (#357): approving `cases` against the aggregate snapshot, then adding
  // another case without refreshing the snapshot, must reopen the gate — the whole point of
  // binding to a set-level snapshot instead of one file.
  it('reopens a satisfied cases gate when a case is added after approval without refreshing the aggregate', async () => {
    const { store, manifest, gates } = createGateStateMachine();
    await writeAndRegisterConfig(store, manifest);
    await writeAndRegister(store, manifest, 'artifacts/scope.json', { requirements: [] });
    await writeAndRegister(store, manifest, 'artifacts/cases/checkout/case-1.json', validCase());
    await writeAndRegister(
      store,
      manifest,
      CASES_INDEX_PATH,
      casesIndex([{ path: 'artifacts/cases/checkout/case-1.json', content: validCase() }]),
    );
    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });
    await gates.approve({ gate: 'cases', artifactPath: CASES_INDEX_PATH, approvedBy: 'operator' });

    // A second case is registered, but the aggregate on disk is stale until it is regenerated.
    const case2 = validCase({ id: 'case-2' });
    await writeAndRegister(store, manifest, 'artifacts/cases/checkout/case-2.json', case2);
    await writeAndRegister(
      store,
      manifest,
      CASES_INDEX_PATH,
      casesIndex([
        { path: 'artifacts/cases/checkout/case-1.json', content: validCase() },
        { path: 'artifacts/cases/checkout/case-2.json', content: case2 },
      ]),
    );

    const state = await gates.validate();

    expect(state.gates.cases.status).toBe('open');
  });

  it('rejects approving cases while any testing type is still undecided (P2-16)', async () => {
    const { store, manifest, gates } = createGateStateMachine();
    await writeAndRegisterConfig(
      store,
      manifest,
      configYaml('e2e: in-scope, api: undecided, a11y: out-of-scope, security: out-of-scope'),
    );
    await writeAndRegister(store, manifest, 'artifacts/scope.json', { requirements: [] });
    await writeAndRegister(store, manifest, 'artifacts/cases/checkout/case-1.json', validCase());
    await writeAndRegister(
      store,
      manifest,
      CASES_INDEX_PATH,
      casesIndex([{ path: 'artifacts/cases/checkout/case-1.json', content: validCase() }]),
    );
    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });

    const error = await gates
      .approve({ gate: 'cases', artifactPath: CASES_INDEX_PATH, approvedBy: 'operator' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('APPROVE_TESTING_UNDECIDED');
  });

  it('rejects approving cases while an in-scope type has no registered case (P2-16)', async () => {
    const { store, manifest, gates } = createGateStateMachine();
    await writeAndRegisterConfig(
      store,
      manifest,
      configYaml('e2e: in-scope, api: out-of-scope, a11y: in-scope, security: out-of-scope'),
    );
    await writeAndRegister(store, manifest, 'artifacts/scope.json', { requirements: [] });
    await writeAndRegister(store, manifest, 'artifacts/cases/checkout/case-1.json', validCase());
    await writeAndRegister(
      store,
      manifest,
      CASES_INDEX_PATH,
      casesIndex([{ path: 'artifacts/cases/checkout/case-1.json', content: validCase() }]),
    );
    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });

    const error = await gates
      .approve({ gate: 'cases', artifactPath: CASES_INDEX_PATH, approvedBy: 'operator' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('APPROVE_CASE_SET_INCOMPLETE');
    expect((error as QaError).message).toContain('a11y');
  });

  it('rejects approving cases while a case is registered for a non-in-scope type (P2-16)', async () => {
    const { store, manifest, gates } = createGateStateMachine();
    await writeAndRegisterConfig(
      store,
      manifest,
      configYaml('e2e: out-of-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope'),
    );
    await writeAndRegister(store, manifest, 'artifacts/scope.json', { requirements: [] });
    await writeAndRegister(store, manifest, 'artifacts/cases/checkout/case-1.json', validCase());
    await writeAndRegister(
      store,
      manifest,
      CASES_INDEX_PATH,
      casesIndex([{ path: 'artifacts/cases/checkout/case-1.json', content: validCase() }]),
    );
    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });

    const error = await gates
      .approve({ gate: 'cases', artifactPath: CASES_INDEX_PATH, approvedBy: 'operator' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('APPROVE_CASE_SET_INCOMPLETE');
    expect((error as QaError).message).toContain('e2e');
  });

  // The issue's own acceptance criterion (P2-16): changing a decided type reopens the cases gate.
  it('reopens a satisfied cases gate when its testing scope decision changes afterward', async () => {
    const { store, manifest, gates } = createGateStateMachine();
    await writeAndRegisterConfig(store, manifest);
    await writeAndRegister(store, manifest, 'artifacts/scope.json', { requirements: [] });
    await writeAndRegister(store, manifest, 'artifacts/cases/checkout/case-1.json', validCase());
    await writeAndRegister(
      store,
      manifest,
      CASES_INDEX_PATH,
      casesIndex([{ path: 'artifacts/cases/checkout/case-1.json', content: validCase() }]),
    );
    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });
    await gates.approve({ gate: 'cases', artifactPath: CASES_INDEX_PATH, approvedBy: 'operator' });

    // Flips `a11y` from out-of-scope to in-scope, the way "qa config set testing.a11y in-scope" would.
    const changed = configYaml('e2e: in-scope, api: out-of-scope, a11y: in-scope, security: out-of-scope');
    await store.writeText('config.yaml', changed);
    const state = await gates.validate();

    expect(state.gates.cases.status).toBe('open');
  });

  it('does not reopen the cases gate when the testing scope decision is unchanged', async () => {
    const { store, manifest, gates } = createGateStateMachine();
    await writeAndRegisterConfig(store, manifest);
    await writeAndRegister(store, manifest, 'artifacts/scope.json', { requirements: [] });
    await writeAndRegister(store, manifest, 'artifacts/cases/checkout/case-1.json', validCase());
    await writeAndRegister(
      store,
      manifest,
      CASES_INDEX_PATH,
      casesIndex([{ path: 'artifacts/cases/checkout/case-1.json', content: validCase() }]),
    );
    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });
    await gates.approve({ gate: 'cases', artifactPath: CASES_INDEX_PATH, approvedBy: 'operator' });

    const state = await gates.validate();

    expect(state.gates.cases.status).toBe('satisfied');
  });

  it('never scope-checks a gate approved before this field existed (no testingScope snapshot)', async () => {
    const { store, manifest, gates } = createGateStateMachine();
    await writeAndRegister(store, manifest, 'artifacts/scope.json', { requirements: [] });
    await gates.approve({ gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });

    const state = await gates.validate();

    expect(state.gates.scope.status).toBe('satisfied');
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
