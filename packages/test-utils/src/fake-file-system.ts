// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// This package stays a leaf with no dependency on any other workspace package (AGENTS.md 5.7), so
// the shape below is a plain structural duplicate of `@qa-ai-stlc/core`'s `FileSystem` port rather
// than an import of it -- TypeScript's structural typing means a `FakeFileSystem` still satisfies
// `FileSystem` at every call site that expects one, with no dependency edge required to prove it.
export interface FileSystemLike {
  readFile(absolutePath: string): Promise<string>;
  readBytes(absolutePath: string): Promise<Uint8Array>;
  writeFile(absolutePath: string, content: string | Uint8Array): Promise<void>;
  deleteFile(absolutePath: string): Promise<void>;
  mkdir(absolutePath: string): Promise<void>;
  pathExists(absolutePath: string): Promise<boolean>;
  listFiles(absolutePath: string): Promise<readonly string[]>;
}

export interface FakeFileSystem extends FileSystemLike {
  /** Returns exactly what was written (string or raw bytes), for tests that need to tell them apart. */
  getRawFile(absolutePath: string): string | Uint8Array | undefined;
}

// Accepts either separator as the boundary after `dirPath`, rather than a hardcoded one: this
// fake's keys are whatever the caller wrote them as (often a forward-slash literal in a test, per
// AGENTS.md 5.6's own artifact-path convention), while real code builds them with `node:path`'s
// OS-native separator, and both need to match here.
function isUnderDirectory(path: string, dirPath: string): boolean {
  if (!path.startsWith(dirPath)) {
    return false;
  }
  const boundary = path.charAt(dirPath.length);
  return boundary === '/' || boundary === '\\';
}

/**
 * An in-memory `FileSystem` for unit tests across the monorepo (AGENTS.md 5.3, 13), so store,
 * manifest, CLI and explorer tests share one fake instead of each package keeping its own copy in
 * sync by hand. Keys are absolute paths as given by the caller; there is no path normalization,
 * matching what the real Node adapter receives from `paths.ts`.
 */
export function createFakeFileSystem(initialFiles: Readonly<Record<string, string>> = {}): FakeFileSystem {
  const files = new Map<string, string | Uint8Array>(Object.entries(initialFiles));
  const directories = new Set<string>();

  function notFound(absolutePath: string): NodeJS.ErrnoException {
    const error = new Error(`ENOENT: no such file, open '${absolutePath}'`) as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    return error;
  }

  return {
    readFile: (absolutePath) => {
      const content = files.get(absolutePath);
      if (content === undefined) {
        return Promise.reject(notFound(absolutePath));
      }
      return Promise.resolve(typeof content === 'string' ? content : Buffer.from(content).toString('utf-8'));
    },
    readBytes: (absolutePath) => {
      const content = files.get(absolutePath);
      if (content === undefined) {
        return Promise.reject(notFound(absolutePath));
      }
      return Promise.resolve(typeof content === 'string' ? Buffer.from(content, 'utf-8') : content);
    },
    writeFile: (absolutePath, content) => {
      files.set(absolutePath, content);
      return Promise.resolve();
    },
    deleteFile: (absolutePath) => {
      files.delete(absolutePath);
      return Promise.resolve();
    },
    mkdir: (absolutePath) => {
      directories.add(absolutePath);
      return Promise.resolve();
    },
    pathExists: (absolutePath) => Promise.resolve(files.has(absolutePath) || directories.has(absolutePath)),
    listFiles: (absolutePath) =>
      Promise.resolve([...files.keys()].filter((path) => isUnderDirectory(path, absolutePath))),
    getRawFile: (absolutePath) => files.get(absolutePath),
  };
}
