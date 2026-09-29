// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { dirname, join, resolve } from 'node:path';
import type { FileSystem } from './ports/file-system.js';

/** `startDir` and each of its parent directories, nearest first, ending at the filesystem root. */
export function listAncestorDirectories(startDir: string): readonly string[] {
  const directories: string[] = [];
  let current = resolve(startDir);
  for (;;) {
    directories.push(current);
    const parent = dirname(current);
    if (parent === current) {
      return directories;
    }
    current = parent;
  }
}

/**
 * The project root every surface must agree on: the nearest directory from `startDir` upward that
 * holds a `.qa/` directory, or `startDir` itself when none does. The MCP server and the
 * `qa-start` skill both resolve this way so a tool never acts on a different directory than the
 * one the operator confirmed. `hasQaDirectory` is injected so the synchronous MCP adapter and the
 * async `FileSystem` port can share the walk.
 */
export function resolveProjectRoot(
  startDir: string,
  hasQaDirectory: (qaDirectory: string) => boolean,
): string {
  const directories = listAncestorDirectories(startDir);
  return directories.find((directory) => hasQaDirectory(join(directory, '.qa'))) ?? resolve(startDir);
}

/** The nearest directory from `startDir` upward that already holds a `.qa/` directory, if any. */
export async function findEnclosingQaDirectory(
  fs: FileSystem,
  startDir: string,
): Promise<string | undefined> {
  for (const directory of listAncestorDirectories(startDir)) {
    if (await fs.pathExists(join(directory, '.qa'))) {
      return directory;
    }
  }
  return undefined;
}
