// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  runApiDiff as runApiDiffOperation,
  type ApiDiffOptions,
  type ApiDiffSummary,
} from '@qa-ai-stlc/explorer';
import type { CommandContext } from '../command-context.js';

export type { ApiDiffSummary } from '@qa-ai-stlc/explorer';

/** `qa api-diff`: delegates to the shared explorer operation (also `qa.api_diff` over MCP). */
export async function runApiDiff(
  context: CommandContext,
  options: ApiDiffOptions = {},
): Promise<ApiDiffSummary> {
  return runApiDiffOperation(context, options);
}
