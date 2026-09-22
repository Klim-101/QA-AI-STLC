// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { QaError } from './errors.js';
import { hashBytes, hashText } from './hash.js';
import { ManifestStore } from './manifest-store.js';
import type { Clock } from './ports/clock.js';
import { QaStore } from './qa-store.js';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';

const FIXED_TIME = new Date('2026-09-16T12:00:00.000Z');
const fixedClock: Clock = { now: () => FIXED_TIME };
const GreetingSchema = z.object({ message: z.string() });

function createManifestStore(): ManifestStore {
  const store = new QaStore({ projectRoot: join('project'), fs: createFakeFileSystem() });
  return new ManifestStore({ store, clock: fixedClock });
}

function createManifestStoreWithFiles(files: Readonly<Record<string, string>>): {
  store: QaStore;
  manifestStore: ManifestStore;
} {
  const store = new QaStore({ projectRoot: join('project'), fs: createFakeFileSystem(files) });
  return { store, manifestStore: new ManifestStore({ store, clock: fixedClock }) };
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
      mode: 'text',
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
    expect(manifest.artifacts['evidence/run-1/step.png']?.mode).toBe('bytes');
    expect(await manifestStore.verify('evidence/run-1/step.png', bytes)).toBe(true);
    expect(await manifestStore.verify('evidence/run-1/step.png', new Uint8Array([9]))).toBe(false);
  });

  it('verifyContent matches a bytes-registered artifact read back as raw bytes (regression, #277)', async () => {
    const manifestStore = createManifestStore();
    // Bytes that are not valid UTF-8 on their own, the way a real PNG's bytes are: registering
    // this with `register()` (bytes hasher) and then checking it the way `readText`+`hashText`
    // used to (a lossy UTF-8 decode) would never match, which is exactly bug #277.
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]);
    await manifestStore.register('evidence/run-1/step.png', bytes);

    expect(await manifestStore.verifyContent('evidence/run-1/step.png', bytes)).toBe(true);
    expect(await manifestStore.verifyContent('evidence/run-1/step.png', new Uint8Array([9]))).toBe(false);
  });

  it('verifyContent matches a text-registered artifact read back as raw bytes', async () => {
    const manifestStore = createManifestStore();
    await manifestStore.register('a.json', 'original');

    expect(await manifestStore.verifyContent('a.json', Buffer.from('original', 'utf-8'))).toBe(true);
    expect(await manifestStore.verifyContent('a.json', Buffer.from('tampered', 'utf-8'))).toBe(false);
  });

  it('verifyContent rejects a CRLF-only edit to bytes-registered content (regression, #303)', async () => {
    const manifestStore = createManifestStore();
    const original = new TextEncoder().encode('line1\nline2\n');
    await manifestStore.register('evidence/run-1/log.bin', original);

    // Inserting \r before every \n would pass a text-hash comparison (hashText normalizes
    // CRLF to LF), which is exactly the bypass #303 fixed: verifyContent must check a
    // bytes-registered entry only against hashBytes, never fall back to a normalized text hash.
    const tampered = new TextEncoder().encode('line1\r\nline2\r\n');
    expect(await manifestStore.verifyContent('evidence/run-1/log.bin', tampered)).toBe(false);
  });

  it('verifyContent is false for a path never registered', async () => {
    const manifestStore = createManifestStore();

    expect(await manifestStore.verifyContent('missing.json', new Uint8Array([1]))).toBe(false);
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

  describe('readVerified', () => {
    it('returns undefined when the artifact does not exist yet', async () => {
      const { manifestStore } = createManifestStoreWithFiles({});

      await expect(manifestStore.readVerified('greeting.json', GreetingSchema)).resolves.toBeUndefined();
    });

    it('returns the schema-validated content when it matches the manifest', async () => {
      const content = JSON.stringify({ message: 'hello' });
      const { manifestStore } = createManifestStoreWithFiles({
        [join('project', '.qa', 'greeting.json')]: content,
      });
      await manifestStore.register('greeting.json', content);

      await expect(manifestStore.readVerified('greeting.json', GreetingSchema)).resolves.toEqual({
        message: 'hello',
      });
    });

    it('throws ARTIFACT_UNREGISTERED for a file that exists but was never registered (P2-07)', async () => {
      const content = JSON.stringify({ message: 'hello' });
      const { manifestStore } = createManifestStoreWithFiles({
        [join('project', '.qa', 'greeting.json')]: content,
      });

      const error = await manifestStore
        .readVerified('greeting.json', GreetingSchema)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(QaError);
      expect((error as QaError).code).toBe('ARTIFACT_UNREGISTERED');
    });

    it('throws ARTIFACT_HASH_MISMATCH for a hand-edited file (P2-07)', async () => {
      const { manifestStore } = createManifestStoreWithFiles({
        [join('project', '.qa', 'greeting.json')]: JSON.stringify({ message: 'tampered' }),
      });
      await manifestStore.register('greeting.json', JSON.stringify({ message: 'hello' }));

      const error = await manifestStore
        .readVerified('greeting.json', GreetingSchema)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(QaError);
      expect((error as QaError).code).toBe('ARTIFACT_HASH_MISMATCH');
    });
  });
});
