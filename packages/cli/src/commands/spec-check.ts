// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runSpecCheck, type RunOptions } from '@qa-ai-stlc/core';
import type { SpecCheckSummary, TestType } from '@qa-ai-stlc/schemas';
import type { CommandContext } from '../command-context.js';
import { RUNNERS_BY_TEST_TYPE } from './run.js';

export interface SpecCheckOptions {
  readonly specFiles: readonly string[];
  readonly testType?: TestType;
  readonly environment?: string;
  readonly identity?: string;
}

/**
 * `qa spec check` / MCP `qa.spec_check` (P4-18): resolves the `Runner` for `--test-type` (default
 * `e2e`) the way `qa run` does, and delegates to `runSpecCheck`, which records nothing.
 */
export async function runSpecCheckCommand(
  context: CommandContext,
  options: SpecCheckOptions,
): Promise<SpecCheckSummary> {
  const runOptions: RunOptions = {
    runner: RUNNERS_BY_TEST_TYPE[options.testType ?? 'e2e'],
    specFiles: options.specFiles,
    ...(options.environment === undefined ? {} : { environment: options.environment }),
    ...(options.identity === undefined ? {} : { identity: options.identity }),
  };
  return runSpecCheck(context, runOptions);
}
