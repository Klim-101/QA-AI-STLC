// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// `npm run <script> --workspaces --if-present` fails with "No workspaces found!" when zero
// packages exist yet, which is expected before the first package under packages/ is added.
// This wrapper treats that specific, well-known npm CLI behavior as a no-op success and
// forwards every other outcome, including a real per-workspace script failure, unchanged.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [scriptName] = process.argv.slice(2);
if (!scriptName) {
  console.error('Usage: run-workspaces.mjs <script-name>');
  process.exit(1);
}

const packagesDir = fileURLToPath(new URL('../packages/', import.meta.url));
const hasAnyPackage =
  existsSync(packagesDir) &&
  readdirSync(packagesDir, { withFileTypes: true }).some(
    (entry) => entry.isDirectory() && existsSync(join(packagesDir, entry.name, 'package.json')),
  );

if (!hasAnyPackage) {
  console.log(`No workspace packages yet; skipping "${scriptName}".`);
  process.exit(0);
}

// Re-invoke the exact npm CLI already running this script, rather than the bare string "npm":
// on Windows, npm's real entry point is "npm.cmd", which execFileSync cannot resolve without
// a shell, and this project never spawns a shell (AGENTS.md §5.6).
const npmExecPath = process.env.npm_execpath;
if (!npmExecPath) {
  console.error('run-workspaces.mjs must be invoked through an npm script (npm_execpath is unset).');
  process.exit(1);
}
try {
  execFileSync(process.execPath, [npmExecPath, 'run', scriptName, '--workspaces', '--if-present'], {
    stdio: 'inherit',
  });
} catch (error) {
  // npm already printed the real failure to stderr above; exit with its status instead of an
  // uncaught-exception stack trace pointing at this wrapper, which did nothing wrong.
  process.exit(typeof error.status === 'number' ? error.status : 1);
}
