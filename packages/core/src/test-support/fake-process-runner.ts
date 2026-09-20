// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { ProcessResult, ProcessRunner } from '../ports/process-runner.js';

/**
 * A `ProcessRunner` that never spawns a real process (AGENTS.md 5.3, 13). Not part of the
 * published package: excluded from the build in `tsconfig.build.json`.
 */
export function createFakeProcessRunner(result: ProcessResult): ProcessRunner {
  return {
    run: () => Promise.resolve(result),
  };
}
