// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Where a command sends its output, injected so every command is testable without touching real
 * process streams (AGENTS.md 5.3). `stdout` carries human or `--json` output; `stderr` carries
 * diagnostics (AGENTS.md 5.8).
 */
export interface CliIO {
  stdout(line: string): void;
  stderr(line: string): void;
}

export const processIO: CliIO = {
  stdout: (line) => {
    process.stdout.write(`${line}\n`);
  },
  stderr: (line) => {
    process.stderr.write(`${line}\n`);
  },
};
