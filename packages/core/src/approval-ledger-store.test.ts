// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import type { Approval } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { ApprovalLedgerStore } from './approval-ledger-store.js';
import { QaStore } from './qa-store.js';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';

function createLedgerStore(): ApprovalLedgerStore {
  const store = new QaStore({ projectRoot: join('project'), fs: createFakeFileSystem() });
  return new ApprovalLedgerStore({ store });
}

function approval(overrides: Partial<Approval> = {}): Approval {
  return {
    gate: 'scope',
    artifactPath: 'artifacts/scope.json',
    artifactSha256: 'a'.repeat(64),
    approvedBy: 'operator',
    approvedAt: '2026-09-20T12:00:00Z',
    ...overrides,
  };
}

describe('ApprovalLedgerStore', () => {
  it('loads an empty ledger when none has been saved', async () => {
    const ledger = await createLedgerStore().load();
    expect(ledger).toEqual({ schemaVersion: 1, approvals: [] });
  });

  it('appends an approval without disturbing previously appended ones', async () => {
    const ledgerStore = createLedgerStore();
    await ledgerStore.append(approval({ gate: 'scope' }));

    await ledgerStore.append(approval({ gate: 'cases', artifactPath: 'artifacts/cases.json' }));

    const ledger = await ledgerStore.load();
    expect(ledger.approvals).toHaveLength(2);
    expect(ledger.approvals[0]?.gate).toBe('scope');
    expect(ledger.approvals[1]?.gate).toBe('cases');
  });

  it('latestForGate returns undefined when the gate has never been approved', async () => {
    const ledgerStore = createLedgerStore();

    expect(await ledgerStore.latestForGate('scope')).toBeUndefined();
  });

  it('latestForGate returns the most recently appended approval for that gate', async () => {
    const ledgerStore = createLedgerStore();
    await ledgerStore.append(
      approval({ artifactSha256: 'a'.repeat(64), approvedAt: '2026-09-20T12:00:00Z' }),
    );

    await ledgerStore.append(
      approval({ artifactSha256: 'b'.repeat(64), approvedAt: '2026-09-20T13:00:00Z' }),
    );

    const latest = await ledgerStore.latestForGate('scope');
    expect(latest?.artifactSha256).toBe('b'.repeat(64));
  });

  it('latestForGate ignores approvals recorded for a different gate', async () => {
    const ledgerStore = createLedgerStore();
    await ledgerStore.append(approval({ gate: 'cases', artifactPath: 'artifacts/cases.json' }));

    expect(await ledgerStore.latestForGate('scope')).toBeUndefined();
  });
});
