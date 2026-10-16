// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The filesystem operations the engine needs, injected so store and manifest logic can be
 * tested without touching a real disk (AGENTS.md 5.3). Paths are always absolute, OS-native
 * paths; project-relative path handling lives in `paths.ts`.
 */
export interface FileSystem {
  readFile(absolutePath: string): Promise<string>;
  /** Reads a file's raw bytes, with no encoding assumed — the only safe way to read back an
   * artifact whose original content type (text or binary) is not known ahead of time. */
  readBytes(absolutePath: string): Promise<Uint8Array>;
  writeFile(absolutePath: string, content: string | Uint8Array): Promise<void>;
  /** Removes a file. A no-op when it does not exist, so a caller cleaning up a scratch file it may
   * or may not have created does not need its own existence check first. */
  deleteFile(absolutePath: string): Promise<void>;
  /**
   * Creates the file only when it does not exist yet and says whether it did. The one atomic claim
   * the store builds its locks on: of several callers racing for a path, exactly one gets `true`.
   */
  createExclusive(absolutePath: string, content: string): Promise<boolean>;
  mkdir(absolutePath: string): Promise<void>;
  pathExists(absolutePath: string): Promise<boolean>;
  /** Every regular file's absolute path under `absolutePath`, recursively; `[]` if it does not exist. */
  listFiles(absolutePath: string): Promise<readonly string[]>;
  /** The path with every symbolic link resolved; rejects with ENOENT when it does not exist. */
  realPath(absolutePath: string): Promise<string>;
}

const TEMPORARY_FILE_SUFFIX = '.qa-tmp';
const RENAME_ATTEMPTS = 20;
const RENAME_RETRY_MS = 10;
// Windows refuses to rename over a file another process has open at that instant (a parallel spoke
// reading the same artifact), with EPERM, EACCES or EBUSY. The reader is done in a moment.
const RENAME_BUSY_CODES: ReadonlySet<string> = new Set(['EPERM', 'EACCES', 'EBUSY']);

async function renameOverTarget(temporaryPath: string, absolutePath: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(temporaryPath, absolutePath);
      return;
    } catch (error) {
      const isBusy = error instanceof Error && 'code' in error && RENAME_BUSY_CODES.has(String(error.code));
      if (!isBusy || attempt === RENAME_ATTEMPTS) {
        await rm(temporaryPath, { force: true });
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, RENAME_RETRY_MS));
    }
  }
}

const CLAIM_TAKEN_CODES: ReadonlySet<string> = new Set(['EEXIST', 'EPERM', 'EACCES']);

export const nodeFileSystem: FileSystem = {
  readFile: (absolutePath) => readFile(absolutePath, 'utf-8'),
  readBytes: (absolutePath) => readFile(absolutePath),
  realPath: (absolutePath) => realpath(absolutePath),
  // Written beside the target and renamed over it, so a reader running while a parallel spoke saves
  // the same artifact sees the old file or the new one, never half of either.
  writeFile: async (absolutePath, content) => {
    const temporaryPath = `${absolutePath}.${randomUUID()}${TEMPORARY_FILE_SUFFIX}`;
    await (typeof content === 'string'
      ? writeFile(temporaryPath, content, 'utf-8')
      : writeFile(temporaryPath, content));
    await renameOverTarget(temporaryPath, absolutePath);
  },
  createExclusive: async (absolutePath, content) => {
    try {
      await writeFile(absolutePath, content, { encoding: 'utf-8', flag: 'wx' });
      return true;
    } catch (error) {
      // Windows reports EPERM or EACCES, not EEXIST, for a file whose deletion is still pending: the
      // holder has just released it. Claiming again a moment later succeeds, so it reads as "taken".
      if (error instanceof Error && 'code' in error && CLAIM_TAKEN_CODES.has(String(error.code))) {
        return false;
      }
      throw error;
    }
  },
  deleteFile: async (absolutePath) => {
    await rm(absolutePath, { force: true });
  },
  mkdir: async (absolutePath) => {
    await mkdir(absolutePath, { recursive: true });
  },
  pathExists: async (absolutePath) => {
    try {
      await stat(absolutePath);
      return true;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  },
  listFiles: async (absolutePath) => {
    let entries;
    try {
      entries = await readdir(absolutePath, { recursive: true, withFileTypes: true });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    // A file being saved by a parallel spoke is not an artifact yet.
    return entries
      .filter((entry) => entry.isFile() && !entry.name.endsWith(TEMPORARY_FILE_SUFFIX))
      .map((entry) => join(entry.parentPath, entry.name));
  },
};
