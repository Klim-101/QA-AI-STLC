// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { QaError } from './errors.js';
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

export interface EngineProjectRootInput {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly isDirectory: (path: string) => boolean;
  readonly hasQaDirectory: (qaDirectory: string) => boolean;
}

function isInside(directory: string, parent: string): boolean {
  const relation = relative(parent, directory);
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation));
}

/**
 * The project root the MCP server acts on. `QA_PROJECT_ROOT` wins when set: it must be an absolute
 * path to an existing directory (`PROJECT_ROOT_INVALID` otherwise) and is used exactly as given.
 * Without it the working directory decides, as `resolveProjectRoot` describes, except when that
 * directory is inside the plugin's own install directory (`PLUGIN_ROOT`): a host such as Codex
 * starts a plugin-declared server there, not in the operator's project, so acting on it would
 * write `.qa/` into the plugin cache (`PROJECT_ROOT_UNRESOLVED`).
 */
export function resolveEngineProjectRoot(input: EngineProjectRootInput): string {
  const explicitRoot = input.env.QA_PROJECT_ROOT;
  if (explicitRoot !== undefined && explicitRoot !== '') {
    if (!isAbsolute(explicitRoot) || !input.isDirectory(explicitRoot)) {
      throw new QaError(
        'PROJECT_ROOT_INVALID',
        `QA_PROJECT_ROOT must be an absolute path to an existing directory, got "${explicitRoot}".`,
        { remediation: 'Set QA_PROJECT_ROOT to the absolute path of the project, or unset it.' },
      );
    }
    return resolve(explicitRoot);
  }

  const pluginRoot = input.env.PLUGIN_ROOT;
  if (pluginRoot !== undefined && pluginRoot !== '' && isInside(resolve(input.cwd), resolve(pluginRoot))) {
    throw new QaError(
      'PROJECT_ROOT_UNRESOLVED',
      'The MCP server was started inside the plugin install directory, so it cannot tell which project to act on.',
      {
        remediation:
          'Register the server outside the plugin so it starts in the project directory (for Codex: "codex mcp add qa-ai-stlc -- npx -y @qa-ai-stlc/mcp-server@<version>"), or set QA_PROJECT_ROOT to the project path.',
      },
    );
  }
  return resolveProjectRoot(input.cwd, input.hasQaDirectory);
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
