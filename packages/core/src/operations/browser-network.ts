// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { NetworkLogEntry } from '../browser-event-log.js';
import type { BrowserOperationContext } from './browser-context.js';
import {
  capResultText,
  readSessionLog,
  type LogReadOptions,
  type LogReadResult,
} from './browser-log-read.js';

/** The first HTTP status that counts as an error for `errorsOnly`. */
const FIRST_ERROR_STATUS = 400;

export type BrowserNetworkOptions = LogReadOptions;
export type BrowserNetworkResult = LogReadResult<NetworkLogEntry>;

/**
 * MCP `qa.browser_network` (P6-61): the requests the session's pages made since a cursor, as method,
 * status or failure, and a templated URL. No header, cookie, body or query value is ever read, so none
 * can appear in the result or in the registered evidence.
 */
export function runBrowserNetwork(
  context: BrowserOperationContext,
  options: BrowserNetworkOptions,
): Promise<BrowserNetworkResult> {
  return readSessionLog(context, options, {
    name: 'network',
    kind: 'other',
    selectLog: (session) => session.eventLogs.network,
    // An entry without a status is a request that failed before any response.
    isError: (entry) => entry.status === undefined || entry.status >= FIRST_ERROR_STATUS,
    cap: (entry) => ({ ...entry, url: capResultText(entry.url) }),
  });
}
