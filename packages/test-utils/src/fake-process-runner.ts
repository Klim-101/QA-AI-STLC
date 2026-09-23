// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// This package stays a leaf with no dependency on any other workspace package (AGENTS.md 5.7), so
// the shape below is a plain structural duplicate of `@qa-ai-stlc/core`'s `ProcessRunner`/
// `ProcessResult` ports rather than an import of them -- TypeScript's structural typing means a
// `createFakeProcessRunner` result still satisfies `ProcessRunner` at every call site that expects one.
export interface ProcessResultLike {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ProcessRunnerLike {
  run(
    command: string,
    args: readonly string[],
    options?: { readonly signal?: AbortSignal },
  ): Promise<ProcessResultLike>;
}

/**
 * A `ProcessRunner` for unit tests across the monorepo (AGENTS.md 5.3, 13) that never spawns a
 * real process: every call resolves to whatever result was configured up front.
 */
export function createFakeProcessRunner(result: ProcessResultLike): ProcessRunnerLike {
  return {
    run: () => Promise.resolve(result),
  };
}
