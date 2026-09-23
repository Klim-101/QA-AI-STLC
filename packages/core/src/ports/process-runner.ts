// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import spawn from 'cross-spawn';

export interface ProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ProcessRunOptions {
  readonly signal?: AbortSignal;
}

/**
 * Runs an external command, injected so browser installation is testable without actually
 * spawning one (AGENTS.md 5.3). Always an argument array, never a shell string (AGENTS.md 5.6).
 */
export interface ProcessRunner {
  run(command: string, args: readonly string[], options?: ProcessRunOptions): Promise<ProcessResult>;
}

// `node:child_process`'s own `execFile`/`spawn` can't invoke a Windows `.cmd`/`.bat` shim (the
// only kind a globally-installed npm CLI produces) without `shell: true`, which -- paired with a
// separate `args` array -- only concatenates them unescaped (Node's DEP0190), exactly the
// shell-string-building AGENTS.md 5.6 forbids. `cross-spawn` resolves those shims safely with no
// `shell: true` (the same fix already proven in scripts/smoke-test-plugin-install.mjs, P2-13).
export const nodeProcessRunner: ProcessRunner = {
  run: (command, args, options) =>
    new Promise((resolve, reject) => {
      const child = spawn(command, args, { signal: options?.signal });
      let stdout = '';
      let stderr = '';
      let settled = false;

      // `stdio` is never overridden above, so both streams are always real (never null); the
      // guard exists only to satisfy ChildProcess's general-purpose type.
      /* v8 ignore next 3 */
      if (child.stdout === null || child.stderr === null) {
        throw new Error('cross-spawn did not attach stdout/stderr streams');
      }
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      // A command that cannot be spawned at all (e.g. ENOENT) emits `error`, never `close`; a
      // command that spawns and exits, even non-zero, emits `close` with a numeric code and no
      // `error`. `settled` keeps whichever fires first from being overridden by the other.
      child.on('error', (error) => {
        // Node's own docs warn `error` and `close` can both fire for the same child in some
        // conditions; `close` normally settles first whenever the process actually started, so
        // this guard is defensive boilerplate, not a path a portable test can force reliably.
        /* v8 ignore next 3 */
        if (settled) {
          return;
        }
        settled = true;
        reject(new Error(`Failed to spawn "${command}": ${error.message}`, { cause: error }));
      });
      child.on('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        // `code` is `null` only when the process was killed by a signal rather than exiting
        // normally; no caller passes `signal` today, so this is a defensive fallback, not a path
        // any test can reach without a platform-dependent kill race.
        /* v8 ignore next */
        resolve({ exitCode: code ?? 0, stdout, stderr });
      });
    }),
};
