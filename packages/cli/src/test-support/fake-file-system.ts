// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { FileSystem } from '@qa-ai-stlc/core';

// Accepts either separator as the boundary after `dirPath`: this fake's keys are whatever the
// caller wrote them as, while real code builds them with `node:path`'s OS-native separator.
function isUnderDirectory(path: string, dirPath: string): boolean {
  if (!path.startsWith(dirPath)) {
    return false;
  }
  const boundary = path.charAt(dirPath.length);
  return boundary === '/' || boundary === '\\';
}

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
    readBytes: (absolutePath) => {
      const content = files.get(absolutePath);
      if (content === undefined) {
        const error = new Error(`ENOENT: no such file, open '${absolutePath}'`) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        return Promise.reject(error);
      }
      return Promise.resolve(typeof content === 'string' ? Buffer.from(content, 'utf-8') : content);
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
    listFiles: (absolutePath) =>
      Promise.resolve([...files.keys()].filter((path) => isUnderDirectory(path, absolutePath))),
  };
}
