// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { dirname, join } from 'node:path';
import type { z } from 'zod';
import type { RelativePath } from '@qa-ai-stlc/schemas';
import { readJsonFile, writeJsonFile } from './json-file.js';
import { nodeFileSystem, type FileSystem } from './ports/file-system.js';
import { resolveRelativePath, toRelativePath } from './paths.js';
import { QaError } from './errors.js';
import { systemClock, type Clock } from './ports/clock.js';

/** How a lock waits for its holder; every part is replaceable so a test needs no real time. */
export interface QaStoreLockOptions {
  readonly clock?: Clock;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  /** How long to wait for the holder before giving up. */
  readonly timeoutMs?: number;
  /** A lock held longer than this belongs to a process that died, and is taken over. */
  readonly staleAfterMs?: number;
  readonly retryEveryMs?: number;
}

export interface QaStoreOptions {
  readonly projectRoot: string;
  readonly fs?: FileSystem;
  readonly lock?: QaStoreLockOptions;
}

const LOCK_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const DEFAULT_LOCK_TIMEOUT_MS = 30_000;
const DEFAULT_LOCK_STALE_AFTER_MS = 120_000;
const DEFAULT_LOCK_RETRY_MS = 25;

function sleepForMilliseconds(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

// The footprint documented in the development plan section 3.2. `state.json` is owned by the
// state machine (P2-01) and `config.yaml` is written by `qa init` (P1-04); this store only
// guarantees the directories they land in exist.
const STORE_SUBDIRECTORIES = ['artifacts', 'selectors', 'runs', 'evidence', 'reports'] as const;

/**
 * The `.qa/` store: resolves an artifact's project-relative path to a real file under `.qa/`,
 * creates the documented directory layout, and reads or writes JSON through the injected
 * `FileSystem` port so callers never touch `node:fs` directly (AGENTS.md 5.3).
 */
export class QaStore {
  readonly projectRoot: string;
  readonly qaDir: string;
  private readonly fs: FileSystem;
  private readonly lockClock: Clock;
  private readonly lockSleep: (milliseconds: number) => Promise<void>;
  private readonly lockTimeoutMs: number;
  private readonly lockStaleAfterMs: number;
  private readonly lockRetryMs: number;

  constructor(options: QaStoreOptions) {
    this.projectRoot = options.projectRoot;
    this.qaDir = join(options.projectRoot, '.qa');
    this.fs = options.fs ?? nodeFileSystem;
    this.lockClock = options.lock?.clock ?? systemClock;
    this.lockSleep = options.lock?.sleep ?? sleepForMilliseconds;
    this.lockTimeoutMs = options.lock?.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
    this.lockStaleAfterMs = options.lock?.staleAfterMs ?? DEFAULT_LOCK_STALE_AFTER_MS;
    this.lockRetryMs = options.lock?.retryEveryMs ?? DEFAULT_LOCK_RETRY_MS;
  }

  /**
   * Runs `action` while holding the named lock under `.qa/locks/`, so a read-modify-write of a
   * shared artifact (the manifest, the selector registry, a run's spoke records) cannot lose an
   * update when spokes run in parallel, in this process or another. The lock is not reentrant:
   * never call `withLock` with the same name from inside `action`. A lock older than
   * `staleAfterMs` was left by a process that died and is taken over; waiting longer than
   * `timeoutMs` fails with `STORE_LOCK_TIMEOUT`.
   */
  async withLock<TResult>(name: string, action: () => Promise<TResult>): Promise<TResult> {
    if (!LOCK_NAME.test(name)) {
      throw new QaError('STORE_LOCK_NAME_INVALID', `"${name}" cannot name a lock`, {
        remediation: 'Use letters, digits, ".", "_" or "-".',
      });
    }
    const lockPath = join(this.qaDir, 'locks', `${name}.lock`);
    await this.fs.mkdir(dirname(lockPath));
    const deadline = this.lockClock.now().getTime() + this.lockTimeoutMs;
    while (!(await this.fs.createExclusive(lockPath, String(this.lockClock.now().getTime())))) {
      if (await this.isLockStale(lockPath)) {
        await this.fs.deleteFile(lockPath);
        continue;
      }
      if (this.lockClock.now().getTime() >= deadline) {
        throw new QaError(
          'STORE_LOCK_TIMEOUT',
          `Waited ${String(this.lockTimeoutMs)} ms for the lock "${name}"`,
          {
            remediation: `Another qa process holds it. If none is running, delete ".qa/locks/${name}.lock" and retry.`,
          },
        );
      }
      await this.lockSleep(this.lockRetryMs);
    }
    try {
      return await action();
    } finally {
      await this.fs.deleteFile(lockPath);
    }
  }

  private async isLockStale(lockPath: string): Promise<boolean> {
    let acquiredAt: number;
    try {
      acquiredAt = Number(await this.fs.readFile(lockPath));
    } catch {
      // The holder released it between the failed claim and this read: not stale, claim it again.
      return false;
    }
    return Number.isFinite(acquiredAt) && this.lockClock.now().getTime() - acquiredAt > this.lockStaleAfterMs;
  }

  /** Resolves a project-relative artifact path (e.g. `manifest.json`) to an absolute path. */
  resolve(relativePath: RelativePath): string {
    return resolveRelativePath(this.qaDir, relativePath);
  }

  /** Converts an absolute path under `.qa/` back to the project-relative form artifacts use. */
  toRelativePath(absolutePath: string): RelativePath {
    return toRelativePath(this.qaDir, absolutePath);
  }

  async exists(): Promise<boolean> {
    return this.fs.pathExists(this.qaDir);
  }

  /** Creates `.qa/` and every committed subdirectory from the documented layout, if missing. */
  async ensureLayout(): Promise<void> {
    await this.fs.mkdir(this.qaDir);
    await Promise.all(STORE_SUBDIRECTORIES.map((name) => this.fs.mkdir(join(this.qaDir, name))));
  }

  async readJson<Schema extends z.ZodType>(
    relativePath: RelativePath,
    schema: Schema,
  ): Promise<z.infer<Schema>> {
    return readJsonFile(this.fs, this.resolve(relativePath), schema);
  }

  async writeJson(relativePath: RelativePath, value: unknown): Promise<void> {
    const absolutePath = this.resolve(relativePath);
    await this.fs.mkdir(dirname(absolutePath));
    await writeJsonFile(this.fs, absolutePath, value);
  }

  async pathExists(relativePath: RelativePath): Promise<boolean> {
    return this.fs.pathExists(this.resolve(relativePath));
  }

  async readText(relativePath: RelativePath): Promise<string> {
    return this.fs.readFile(this.resolve(relativePath));
  }

  /** Every regular file's project-relative path under `relativePath`, recursively; `[]` if it does not exist. */
  async listFiles(relativePath: RelativePath): Promise<readonly RelativePath[]> {
    const absolutePaths = await this.fs.listFiles(this.resolve(relativePath));
    return absolutePaths.map((absolutePath) => this.toRelativePath(absolutePath));
  }

  /** Reads a file's raw bytes, with no encoding assumed (unlike `readText`'s UTF-8 decode). */
  async readBytes(relativePath: RelativePath): Promise<Uint8Array> {
    return this.fs.readBytes(this.resolve(relativePath));
  }

  async writeText(relativePath: RelativePath, content: string): Promise<void> {
    await this.writeBytes(relativePath, content);
  }

  /** Like `writeText`, but also accepts raw bytes for binary artifacts such as evidence. */
  async writeBytes(relativePath: RelativePath, content: string | Uint8Array): Promise<void> {
    const absolutePath = this.resolve(relativePath);
    await this.fs.mkdir(dirname(absolutePath));
    await this.fs.writeFile(absolutePath, content);
  }
}
