// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { FileSystem } from '../ports/file-system.js';

/**
 * An in-memory `FileSystem` for unit tests that exercise store and manifest logic without
 * touching a real disk (AGENTS.md 5.3, 13). Keys are absolute paths as given by the caller;
 * there is no path normalization, matching what the real Node adapter receives from `paths.ts`.
 */
export function createFakeFileSystem(initialFiles: Readonly<Record<string, string>> = {}): FileSystem {
  const files = new Map<string, string>(Object.entries(initialFiles));
  const directories = new Set<string>();

  return {
    readFile: (absolutePath) => {
      const content = files.get(absolutePath);
      if (content === undefined) {
        const error = new Error(`ENOENT: no such file, open '${absolutePath}'`) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        return Promise.reject(error);
      }
      return Promise.resolve(content);
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
  };
}
