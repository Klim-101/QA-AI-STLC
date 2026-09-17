// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AuthSessionStore } from './auth-session-store.js';
import { ManifestStore } from './manifest-store.js';
import type { StorageState } from './ports/browser-launcher.js';
import { QaStore } from './qa-store.js';
import { createFakeFileSystem } from './test-support/fake-file-system.js';

const SESSION: StorageState = {
  cookies: [
    {
      name: 'session',
      value: 'abc',
      domain: 'example.com',
      path: '/',
      expires: -1,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ],
  origins: [],
};

describe('AuthSessionStore', () => {
  it('returns undefined for an identity with no saved session', async () => {
    const store = new QaStore({ projectRoot: join('project'), fs: createFakeFileSystem() });
    const authStore = new AuthSessionStore(store);

    expect(await authStore.load('admin')).toBeUndefined();
  });

  it('round-trips a saved storage state', async () => {
    const store = new QaStore({ projectRoot: join('project'), fs: createFakeFileSystem() });
    const authStore = new AuthSessionStore(store);

    await authStore.save('admin', SESSION);

    expect(await authStore.load('admin')).toEqual(SESSION);
  });

  it('keeps separate identities under separate paths', async () => {
    const store = new QaStore({ projectRoot: join('project'), fs: createFakeFileSystem() });
    const authStore = new AuthSessionStore(store);

    await authStore.save('admin', SESSION);

    expect(await authStore.load('viewer')).toBeUndefined();
  });

  it('never registers the session in the manifest', async () => {
    const fs = createFakeFileSystem();
    const store = new QaStore({ projectRoot: join('project'), fs });
    const manifest = new ManifestStore({ store });
    const authStore = new AuthSessionStore(store);

    await authStore.save('admin', SESSION);

    const loaded = await manifest.load();
    expect(Object.keys(loaded.artifacts)).toHaveLength(0);
  });
});
