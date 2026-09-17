// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { FileSystem } from '@qa-ai-stlc/core';

/**
 * An in-memory `FileSystem` for CLI command tests (AGENTS.md 5.3, 13). Not part of the published
 * package: excluded from the build in `tsconfig.build.json`.
 */
export function createFakeFileSystem(initialFiles: Readonly<Record<string, string>> = {}): FileSystem {
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
  };
}
