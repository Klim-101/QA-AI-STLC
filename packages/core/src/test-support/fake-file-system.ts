// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { FileSystem } from '../ports/file-system.js';

export interface FakeFileSystem extends FileSystem {
  /** Returns exactly what was written (string or raw bytes), for tests that need to tell them apart. */
  getRawFile(absolutePath: string): string | Uint8Array | undefined;
}

/**
 * An in-memory `FileSystem` for unit tests that exercise store and manifest logic without
 * touching a real disk (AGENTS.md 5.3, 13). Keys are absolute paths as given by the caller;
 * there is no path normalization, matching what the real Node adapter receives from `paths.ts`.
 */
export function createFakeFileSystem(initialFiles: Readonly<Record<string, string>> = {}): FakeFileSystem {
  const files = new Map<string, string | Uint8Array>(Object.entries(initialFiles));
  const directories = new Set<string>();

  return {
    readFile: (absolutePath) => {
      const content = files.get(absolutePath);
      if (content === undefined) {
        const error = new Error(`ENOENT: no such file, open '${absolutePath}'`) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        return Promise.reject(error);
      }
      return Promise.resolve(typeof content === 'string' ? content : Buffer.from(content).toString('utf-8'));
    },
    writeFile: (absolutePath, content) => {
      files.set(absolutePath, content);
      return Promise.resolve();
    },
    mkdir: (absolutePath) => {
      directories.add(absolutePath);
      return Promise.resolve();
    },
    pathExists: (absolutePath) => Promise.resolve(files.has(absolutePath) || directories.has(absolutePath)),
    getRawFile: (absolutePath) => files.get(absolutePath),
  };
}
