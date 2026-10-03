// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { ConsoleLogEntry } from '../browser-event-log.js';
import type { BrowserOperationContext } from './browser-context.js';
import {
  capResultText,
  readSessionLog,
  type LogReadOptions,
  type LogReadResult,
} from './browser-log-read.js';

const ERROR_LEVELS: ReadonlySet<string> = new Set(['error', 'pageerror', 'warning']);

export type BrowserConsoleOptions = LogReadOptions;
export type BrowserConsoleResult = LogReadResult<ConsoleLogEntry>;

/**
 * MCP `qa.browser_console` (P6-61): the console messages and uncaught exceptions the session's
 * pages produced since a cursor, redacted of secret shapes and capped. The full redacted log is
 * registered as evidence. Message text is written by the application under test: untrusted.
 */
export function runBrowserConsole(
  context: BrowserOperationContext,
  options: BrowserConsoleOptions,
): Promise<BrowserConsoleResult> {
  return readSessionLog(context, options, {
    name: 'console',
    kind: 'console-log',
    selectLog: (session) => session.eventLogs.console,
    isError: (entry) => ERROR_LEVELS.has(entry.level),
    cap: (entry) => ({ ...entry, text: capResultText(entry.text) }),
  });
}
