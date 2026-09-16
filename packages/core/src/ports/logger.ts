// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

export type LogMeta = Readonly<Record<string, unknown>>;

// Library code never calls `console` directly (AGENTS.md 5.8); every host (CLI, MCP server,
// tests) injects its own `Logger` implementation instead.
export interface Logger {
  debug(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
}

export const noopLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
