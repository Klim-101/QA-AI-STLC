// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError } from '@qa-ai-stlc/core';

/**
 * What a tool call result's error content carries (AGENTS.md 5.4, 12.3): a stable code an agent
 * can branch on and, when there is one, a remediation it can act on — never a raw stack trace.
 */
export interface ToolErrorPayload {
  readonly code: string;
  readonly message: string;
  readonly remediation?: string;
}

const INTERNAL_ERROR_CODE = 'MCP_TOOL_INTERNAL_ERROR';

/**
 * Converts whatever a tool handler threw into a structured payload: a `QaError`'s own `code` and
 * `remediation` pass through unchanged; anything else (a real bug, not an expected failure) gets
 * a generic code and no remediation, since there is nothing actionable to suggest.
 */
export function toToolErrorPayload(error: unknown): ToolErrorPayload {
  if (error instanceof QaError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.remediation !== undefined ? { remediation: error.remediation } : {}),
    };
  }
  return { code: INTERNAL_ERROR_CODE, message: error instanceof Error ? error.message : String(error) };
}
