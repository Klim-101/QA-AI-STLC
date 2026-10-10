// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startManagedServer, type ManagedServer } from './managed-server.js';

const DEMO_APP_DIRECTORY = fileURLToPath(new URL('../../../examples/demo-app/', import.meta.url));

/** Compiles a TypeScript project (`tsc -b tsconfig.build.json`); incremental, so a current build finishes at once. */
export async function buildProject(directory: string): Promise<void> {
  const tscPath = createRequire(import.meta.url).resolve('typescript/bin/tsc');
  const build = spawn(process.execPath, [tscPath, '-b', 'tsconfig.build.json'], {
    cwd: directory,
    stdio: 'ignore',
    shell: false,
  });
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    build.once('error', reject);
    build.once('exit', resolve);
  });
  if (exitCode !== 0) {
    throw new Error(`Building "${directory}" failed with exit code ${String(exitCode)}.`);
  }
}

/**
 * Starts `examples/demo-app` on `port` for an integration test. It runs `node dist/server.js`
 * directly rather than `npm run start`: an npm wrapper that is killed leaves the server running on
 * Windows (#597). Resolves once the server accepts connections.
 */
export async function startDemoApp(port: number): Promise<ManagedServer> {
  await buildProject(DEMO_APP_DIRECTORY);
  return startManagedServer({
    command: process.execPath,
    args: ['dist/server.js'],
    cwd: DEMO_APP_DIRECTORY,
    env: { ...process.env, DEMO_APP_PORT: String(port) },
    port,
  });
}
