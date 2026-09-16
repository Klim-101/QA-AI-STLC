// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';

/**
 * The filesystem operations the engine needs, injected so store and manifest logic can be
 * tested without touching a real disk (AGENTS.md 5.3). Paths are always absolute, OS-native
 * paths; project-relative path handling lives in `paths.ts`.
 */
export interface FileSystem {
  readFile(absolutePath: string): Promise<string>;
  writeFile(absolutePath: string, content: string): Promise<void>;
  mkdir(absolutePath: string): Promise<void>;
  pathExists(absolutePath: string): Promise<boolean>;
}

export const nodeFileSystem: FileSystem = {
  readFile: (absolutePath) => readFile(absolutePath, 'utf-8'),
  writeFile: (absolutePath, content) => writeFile(absolutePath, content, 'utf-8'),
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
};
