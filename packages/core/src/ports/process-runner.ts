// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { execFile, type ExecException } from 'node:child_process';

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

function hasNumericCode(error: ExecException): error is ExecException & { code: number } {
  return typeof error.code === 'number';
}

export const nodeProcessRunner: ProcessRunner = {
  run: (command, args, options) =>
    new Promise((resolve, reject) => {
      execFile(command, args, { signal: options?.signal }, (error, stdout, stderr) => {
        if (error === null) {
          resolve({ exitCode: 0, stdout, stderr });
          return;
        }
        // A numeric `code` is the child process's own exit code; anything else (a string like
        // "ENOENT") means the command itself could not be spawned at all.
        if (hasNumericCode(error)) {
          resolve({ exitCode: error.code, stdout, stderr });
          return;
        }
        reject(new Error(`Failed to spawn "${command}": ${error.message}`, { cause: error }));
      });
    }),
};
