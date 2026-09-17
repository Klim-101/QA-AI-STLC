// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QaError } from './errors.js';
import { hashBytes, hashText } from './hash.js';
import { ManifestStore } from './manifest-store.js';
import type { Clock } from './ports/clock.js';
import { QaStore } from './qa-store.js';
import { createFakeFileSystem } from './test-support/fake-file-system.js';

const FIXED_TIME = new Date('2026-09-16T12:00:00.000Z');
const fixedClock: Clock = { now: () => FIXED_TIME };

function createManifestStore(): ManifestStore {
  const store = new QaStore({ projectRoot: join('project'), fs: createFakeFileSystem() });
  return new ManifestStore({ store, clock: fixedClock });
}

describe('ManifestStore', () => {
  it('loads an empty manifest when none has been saved', async () => {
    const manifest = await createManifestStore().load();
    expect(manifest).toEqual({ schemaVersion: 1, artifacts: {} });
  });

  it('registers an artifact with its hash and the injected clock time', async () => {
    const manifestStore = createManifestStore();

    await manifestStore.register('artifacts/scope.json', 'content');

    const manifest = await manifestStore.load();
    expect(manifest.artifacts['artifacts/scope.json']).toEqual({
      sha256: hashText('content'),
      registeredAt: FIXED_TIME.toISOString(),
    });
  });

  it('keeps previously registered artifacts when registering a new one', async () => {
    const manifestStore = createManifestStore();
    await manifestStore.register('a.json', 'a');

    await manifestStore.register('b.json', 'b');

    const manifest = await manifestStore.load();
    expect(Object.keys(manifest.artifacts).sort()).toEqual(['a.json', 'b.json']);
  });

  it('verifies matching content as true and unregistered or changed content as false', async () => {
    const manifestStore = createManifestStore();
    await manifestStore.register('a.json', 'original');

    expect(await manifestStore.verify('a.json', 'original')).toBe(true);
    expect(await manifestStore.verify('a.json', 'tampered')).toBe(false);
    expect(await manifestStore.verify('missing.json', 'anything')).toBe(false);
  });

  it('assertRegistered throws ARTIFACT_UNREGISTERED for a path never registered', async () => {
    const manifestStore = createManifestStore();

    const error = await manifestStore
      .assertRegistered('missing.json', 'content')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('ARTIFACT_UNREGISTERED');
  });

  it('assertRegistered throws ARTIFACT_HASH_MISMATCH for tampered content', async () => {
    const manifestStore = createManifestStore();
    await manifestStore.register('a.json', 'original');

    const error = await manifestStore
      .assertRegistered('a.json', 'tampered')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('ARTIFACT_HASH_MISMATCH');
  });

  it('assertRegistered resolves without throwing for matching content', async () => {
    const manifestStore = createManifestStore();
    await manifestStore.register('a.json', 'original');

    await expect(manifestStore.assertRegistered('a.json', 'original')).resolves.toBeUndefined();
  });

  it('registers and verifies raw bytes the same way as text', async () => {
    const manifestStore = createManifestStore();
    const bytes = new Uint8Array([1, 2, 3]);

    await manifestStore.register('evidence/run-1/step.png', bytes);

    const manifest = await manifestStore.load();
    expect(manifest.artifacts['evidence/run-1/step.png']?.sha256).toBe(hashBytes(bytes));
    expect(await manifestStore.verify('evidence/run-1/step.png', bytes)).toBe(true);
    expect(await manifestStore.verify('evidence/run-1/step.png', new Uint8Array([9]))).toBe(false);
  });

  it('defaults to the system clock when none is provided', async () => {
    const store = new QaStore({ projectRoot: join('project'), fs: createFakeFileSystem() });
    const manifestStore = new ManifestStore({ store });

    const before = Date.now();
    await manifestStore.register('a.json', 'content');
    const after = Date.now();

    const manifest = await manifestStore.load();
    const registeredAt = new Date(manifest.artifacts['a.json']?.registeredAt ?? '').getTime();
    expect(registeredAt).toBeGreaterThanOrEqual(before);
    expect(registeredAt).toBeLessThanOrEqual(after);
  });
});
