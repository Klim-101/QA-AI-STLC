// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The filesystem operations the engine needs, injected so store and manifest logic can be
 * tested without touching a real disk (AGENTS.md 5.3). Paths are always absolute, OS-native
 * paths; project-relative path handling lives in `paths.ts`.
 */
export interface FileSystem {
  readFile(absolutePath: string): Promise<string>;
  writeFile(absolutePath: string, content: string | Uint8Array): Promise<void>;
  mkdir(absolutePath: string): Promise<void>;
  pathExists(absolutePath: string): Promise<boolean>;
  /** Every regular file's absolute path under `absolutePath`, recursively; `[]` if it does not exist. */
  listFiles(absolutePath: string): Promise<readonly string[]>;
}

export const nodeFileSystem: FileSystem = {
  readFile: (absolutePath) => readFile(absolutePath, 'utf-8'),
  writeFile: (absolutePath, content) =>
    typeof content === 'string'
      ? writeFile(absolutePath, content, 'utf-8')
      : writeFile(absolutePath, content),
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
    return entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
  },
};
