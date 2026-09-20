// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { BrowserLauncher } from './ports/browser-launcher.js';
import type { Clock } from './ports/clock.js';
import type { FileSystem } from './ports/file-system.js';
import type { HttpClient } from './ports/http-client.js';
import type { Logger } from './ports/logger.js';
import type { ProcessRunner } from './ports/process-runner.js';

/**
 * Everything an engine operation needs, injected so it is testable without real I/O, a real
 * clock or a real child process (AGENTS.md 5.3). The CLI and the MCP server each build one from
 * their own adapters and call the same operation function, so "same core call" (P2-05) holds by
 * construction rather than by convention.
 */
export interface EngineContext {
  readonly projectRoot: string;
  readonly fs: FileSystem;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly processRunner: ProcessRunner;
  readonly httpClient: HttpClient;
  readonly browserLauncher: BrowserLauncher;
  readonly env: Readonly<Record<string, string | undefined>>;
}
