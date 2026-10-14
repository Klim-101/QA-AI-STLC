// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// A demo-app test names its port in `const PORT = <n>` or passes a literal to `startDemoApp(<n>)`.
// Vitest runs test files of different packages at the same time, so two files holding one port
// fail at random with "Port <n> is already in use". Ports are fixed numbers, not 0, because the
// demo app logs the port it was told to bind to.
const PORT_PATTERNS = [/\bPORT\s*=\s*(\d{4,5})\b/gu, /\bstartDemoApp\(\s*(\d{4,5})\s*[,)]/gu];

/** The ports a test file's source claims. */
export function extractPorts(content) {
  return PORT_PATTERNS.flatMap((pattern) => [...content.matchAll(pattern)].map((match) => Number(match[1])));
}

/** The ports claimed by more than one file, with the files, sorted by port. */
export function findDuplicatePorts(files) {
  const pathsByPort = new Map();
  for (const { path, content } of files) {
    for (const port of new Set(extractPorts(content))) {
      pathsByPort.set(port, [...(pathsByPort.get(port) ?? []), path]);
    }
  }
  return [...pathsByPort]
    .filter(([, paths]) => paths.length > 1)
    .map(([port, paths]) => ({ port, paths: paths.sort() }))
    .sort((a, b) => a.port - b.port);
}

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.git']);

/** Every `*.test.ts` and `*.test.mjs` under `root`, as project-relative paths with `/`. */
export function listTestFiles(root) {
  const found = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name) && !entry.name.startsWith('.')) {
          visit(join(directory, entry.name));
        }
      } else if (/\.test\.(?:ts|mjs)$/u.test(entry.name)) {
        found.push(relative(root, join(directory, entry.name)).split(sep).join('/'));
      }
    }
  };
  for (const top of ['packages', 'examples', 'scripts']) {
    visit(join(root, top));
  }
  return found.sort();
}

/** The files under `root` that claim a port another file claims too. */
export function findDuplicatePortsUnder(root) {
  return findDuplicatePorts(
    listTestFiles(root).map((path) => ({ path, content: readFileSync(join(root, path), 'utf8') })),
  );
}
