// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { EvidenceQuarantineReceiptSchema } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { EvidenceStore, type EvidenceRegistration } from './evidence-store.js';
import { hashBytes, hashText } from './hash.js';
import type { Clock } from './ports/clock.js';
import { ManifestStore } from './manifest-store.js';
import { QaStore } from './qa-store.js';
import { createFakeFileSystem, type FakeFileSystem } from './test-support/fake-file-system.js';

const FIXED_TIME = new Date('2026-09-16T12:00:00.000Z');
const fixedClock: Clock = { now: () => FIXED_TIME };

function createEvidenceStore(): {
  evidenceStore: EvidenceStore;
  store: QaStore;
  manifest: ManifestStore;
  fs: FakeFileSystem;
} {
  const fs = createFakeFileSystem();
  const store = new QaStore({ projectRoot: join('project'), fs });
  const manifest = new ManifestStore({ store, clock: fixedClock });
  const evidenceStore = new EvidenceStore({ store, manifest, clock: fixedClock });
  return { evidenceStore, store, manifest, fs };
}

function expectRegistered(registration: EvidenceRegistration) {
  if (registration.status !== 'registered') {
    throw new Error(`expected a registered result, got ${registration.status}`);
  }
  return registration.evidence;
}

function expectQuarantined(registration: EvidenceRegistration) {
  if (registration.status !== 'quarantined') {
    throw new Error(`expected a quarantined result, got ${registration.status}`);
  }
  return registration;
}

describe('EvidenceStore', () => {
  it('registers clean text evidence with its hash, path and timestamp', async () => {
    const { evidenceStore, store } = createEvidenceStore();

    const registration = await evidenceStore.register({
      id: 'evidence-1',
      runId: 'run-1',
      stepId: 'step-1',
      kind: 'console-log',
      content: 'page loaded successfully',
    });

    const evidence = expectRegistered(registration);
    expect(evidence).toEqual({
      schemaVersion: 1,
      id: 'evidence-1',
      runId: 'run-1',
      stepId: 'step-1',
      kind: 'console-log',
      path: 'evidence/run-1/evidence-1.log',
      sha256: hashText('page loaded successfully'),
      createdAt: FIXED_TIME.toISOString(),
      redacted: false,
    });
    expect(await store.readText(evidence.path)).toBe('page loaded successfully');
  });

  it('registers clean binary evidence and hashes the raw bytes', async () => {
    const { evidenceStore, fs, store } = createEvidenceStore();
    const bytes = new Uint8Array([1, 2, 3]);

    const registration = await evidenceStore.register({
      id: 'evidence-1',
      runId: 'run-1',
      kind: 'screenshot',
      content: bytes,
    });

    const evidence = expectRegistered(registration);
    expect(evidence.path).toBe('evidence/run-1/evidence-1.png');
    expect(evidence.sha256).toBe(hashBytes(bytes));
    expect(evidence.stepId).toBeUndefined();
    expect(fs.getRawFile(store.resolve(evidence.path))).toEqual(bytes);
  });

  it('registers the evidence hash in the manifest', async () => {
    const { evidenceStore, manifest } = createEvidenceStore();

    const registration = await evidenceStore.register({
      id: 'evidence-1',
      runId: 'run-1',
      kind: 'other',
      content: 'anything',
    });

    const evidence = expectRegistered(registration);
    await expect(manifest.assertRegistered(evidence.path, 'anything')).resolves.toBeUndefined();
  });

  it('quarantines a trace containing a token: deletes nothing real, keeps a sanitized receipt', async () => {
    const { evidenceStore, store, manifest } = createEvidenceStore();

    const registration = await evidenceStore.register({
      id: 'evidence-1',
      runId: 'run-1',
      kind: 'trace',
      content: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345',
    });

    const quarantined = expectQuarantined(registration);
    expect(quarantined.patterns).toEqual(['bearer-token']);
    expect(quarantined.receiptPath).toBe('evidence/run-1/evidence-1.quarantine.json');

    // The real, leaking file was never written anywhere.
    expect(await store.pathExists('evidence/run-1/evidence-1.zip')).toBe(false);

    const receipt = await store.readJson(quarantined.receiptPath, EvidenceQuarantineReceiptSchema);
    expect(receipt).toEqual({
      schemaVersion: 1,
      id: 'evidence-1',
      runId: 'run-1',
      kind: 'trace',
      createdAt: FIXED_TIME.toISOString(),
      reason: 'secret-detected',
      patterns: ['bearer-token'],
    });
    await expect(
      manifest.assertRegistered(quarantined.receiptPath, JSON.stringify(receipt, null, 2) + '\n'),
    ).resolves.toBeUndefined();
  });

  it('quarantines evidence linked to a step, keeping the stepId on the receipt', async () => {
    const { evidenceStore, store } = createEvidenceStore();

    const registration = await evidenceStore.register({
      id: 'evidence-1',
      runId: 'run-1',
      stepId: 'step-1',
      kind: 'trace',
      content: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345',
    });

    const quarantined = expectQuarantined(registration);
    const receipt = await store.readJson(quarantined.receiptPath, EvidenceQuarantineReceiptSchema);
    expect(receipt.stepId).toBe('step-1');
  });

  it('redacts network-har content proactively before writing, and marks it redacted', async () => {
    const { evidenceStore, store } = createEvidenceStore();
    const harContent = JSON.stringify({
      log: {
        entries: [{ request: { headers: [{ name: 'Authorization', value: 'Bearer clean-token-value' }] } }],
      },
    });

    const registration = await evidenceStore.register({
      id: 'evidence-1',
      runId: 'run-1',
      kind: 'network-har',
      content: harContent,
    });

    const evidence = expectRegistered(registration);
    expect(evidence.redacted).toBe(true);
    const written = await store.readText(evidence.path);
    expect(written).not.toContain('clean-token-value');
  });

  it('still quarantines network-har content that keeps a secret shape after redaction', async () => {
    const { evidenceStore } = createEvidenceStore();
    const harContent = JSON.stringify({
      log: { entries: [{ request: { headers: [{ name: 'X-Debug', value: 'AKIAIOSFODNN7EXAMPLE' }] } }] },
    });

    const registration = await evidenceStore.register({
      id: 'evidence-1',
      runId: 'run-1',
      kind: 'network-har',
      content: harContent,
    });

    expect(expectQuarantined(registration).patterns).toEqual(['aws-access-key-id']);
  });

  it('uses an explicit file extension when given one', async () => {
    const { evidenceStore } = createEvidenceStore();

    const registration = await evidenceStore.register({
      id: 'evidence-1',
      runId: 'run-1',
      kind: 'other',
      content: 'custom',
      fileExtension: 'txt',
    });

    expect(expectRegistered(registration).path).toBe('evidence/run-1/evidence-1.txt');
  });

  it('defaults to the system clock when none is provided', async () => {
    const fs = createFakeFileSystem();
    const store = new QaStore({ projectRoot: join('project'), fs });
    const manifest = new ManifestStore({ store });
    const evidenceStore = new EvidenceStore({ store, manifest });

    const before = Date.now();
    const registration = await evidenceStore.register({ id: 'e', runId: 'r', kind: 'other', content: 'x' });
    const after = Date.now();

    const createdAt = new Date(expectRegistered(registration).createdAt).getTime();
    expect(createdAt).toBeGreaterThanOrEqual(before);
    expect(createdAt).toBeLessThanOrEqual(after);
  });
});
