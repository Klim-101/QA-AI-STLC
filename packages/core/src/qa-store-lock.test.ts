// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { describe, expect, it } from 'vitest';
import { QaStore } from './qa-store.js';

const LOCK_PATH = join('project', '.qa', 'locks', 'shared.lock');

function fakeTime(): { readonly clock: { now: () => Date }; advance: (ms: number) => void } {
  let current = 1_000_000;
  return {
    clock: { now: () => new Date(current) },
    advance: (milliseconds) => {
      current += milliseconds;
    },
  };
}

describe('QaStore.withLock', () => {
  it('runs the action, returns its value and removes the lock', async () => {
    const fs = createFakeFileSystem();
    const store = new QaStore({ projectRoot: 'project', fs });

    const result = await store.withLock('shared', async () => {
      expect(await fs.pathExists(LOCK_PATH)).toBe(true);
      return 42;
    });

    expect(result).toBe(42);
    expect(await fs.pathExists(LOCK_PATH)).toBe(false);
  });

  it('removes the lock when the action fails', async () => {
    const fs = createFakeFileSystem();
    const store = new QaStore({ projectRoot: 'project', fs });

    await expect(store.withLock('shared', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');

    expect(await fs.pathExists(LOCK_PATH)).toBe(false);
  });

  it('runs parallel callers one after another, so a read-modify-write loses nothing', async () => {
    await withTempDir(async (directory) => {
      const store = new QaStore({ projectRoot: directory, lock: { retryEveryMs: 1 } });
      let counter = 0;

      await Promise.all(
        Array.from({ length: 12 }, () =>
          store.withLock('shared', async () => {
            const read = counter;
            await new Promise((resolve) => setTimeout(resolve, 2));
            counter = read + 1;
          }),
        ),
      );

      expect(counter).toBe(12);
    });
  });

  it('waits for the holder, polling at the retry interval', async () => {
    const time = fakeTime();
    const fs = createFakeFileSystem();
    await fs.writeFile(LOCK_PATH, String(time.clock.now().getTime()));
    const sleeps: number[] = [];
    const store = new QaStore({
      projectRoot: 'project',
      fs,
      lock: {
        clock: time.clock,
        retryEveryMs: 25,
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
          time.advance(milliseconds);
          if (sleeps.length === 3) {
            await fs.deleteFile(LOCK_PATH);
          }
        },
      },
    });

    await store.withLock('shared', () => Promise.resolve());

    expect(sleeps).toEqual([25, 25, 25]);
  });

  it('gives up with a coded error once the holder outlasts the timeout', async () => {
    const time = fakeTime();
    const fs = createFakeFileSystem();
    await fs.writeFile(LOCK_PATH, String(time.clock.now().getTime()));
    const store = new QaStore({
      projectRoot: 'project',
      fs,
      lock: {
        clock: time.clock,
        timeoutMs: 100,
        staleAfterMs: 10_000,
        retryEveryMs: 40,
        sleep: (milliseconds) => {
          time.advance(milliseconds);
          return Promise.resolve();
        },
      },
    });

    await expect(store.withLock('shared', () => Promise.resolve())).rejects.toMatchObject({
      code: 'STORE_LOCK_TIMEOUT',
    });
    expect(await fs.pathExists(LOCK_PATH)).toBe(true);
  });

  it('takes over a lock left by a process that died', async () => {
    const time = fakeTime();
    const fs = createFakeFileSystem();
    await fs.writeFile(LOCK_PATH, String(time.clock.now().getTime() - 500));
    const store = new QaStore({
      projectRoot: 'project',
      fs,
      lock: { clock: time.clock, staleAfterMs: 100 },
    });

    expect(await store.withLock('shared', () => Promise.resolve('ran'))).toBe('ran');
  });

  it('does not take over a lock whose content is not a time', async () => {
    const time = fakeTime();
    const fs = createFakeFileSystem();
    await fs.writeFile(LOCK_PATH, 'not a time');
    const store = new QaStore({
      projectRoot: 'project',
      fs,
      lock: {
        clock: time.clock,
        timeoutMs: 10,
        retryEveryMs: 10,
        sleep: (milliseconds) => {
          time.advance(milliseconds);
          return Promise.resolve();
        },
      },
    });

    await expect(store.withLock('shared', () => Promise.resolve())).rejects.toMatchObject({
      code: 'STORE_LOCK_TIMEOUT',
    });
  });

  it('does not take over a lock whose holder has not yet written the time into it', async () => {
    const time = fakeTime();
    const fs = createFakeFileSystem();
    await fs.writeFile(LOCK_PATH, '');
    const store = new QaStore({
      projectRoot: 'project',
      fs,
      lock: {
        clock: time.clock,
        timeoutMs: 10,
        retryEveryMs: 10,
        sleep: (milliseconds) => {
          time.advance(milliseconds);
          return Promise.resolve();
        },
      },
    });

    await expect(store.withLock('shared', () => Promise.resolve())).rejects.toMatchObject({
      code: 'STORE_LOCK_TIMEOUT',
    });
    expect(await fs.pathExists(LOCK_PATH)).toBe(true);
  });

  it('claims the lock again when its holder released it between the claim and the read', async () => {
    const fs = createFakeFileSystem();
    await fs.writeFile(LOCK_PATH, '1');
    const racing = {
      ...fs,
      readFile: async (path: string): Promise<string> => {
        await fs.deleteFile(path);
        throw new Error('gone');
      },
    };
    const store = new QaStore({ projectRoot: 'project', fs: racing });

    expect(await store.withLock('shared', () => Promise.resolve('ran'))).toBe('ran');
  });

  it('refuses a name that could leave the locks folder', async () => {
    const store = new QaStore({ projectRoot: 'project', fs: createFakeFileSystem() });

    await expect(store.withLock('../escape', () => Promise.resolve())).rejects.toMatchObject({
      code: 'STORE_LOCK_NAME_INVALID',
    });
  });
});
