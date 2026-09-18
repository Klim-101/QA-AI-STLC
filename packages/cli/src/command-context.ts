// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  fetchHttpClient,
  nodeFileSystem,
  nodeProcessRunner,
  noopLogger,
  playwrightBrowserLauncher,
  systemClock,
  type BrowserLauncher,
  type Clock,
  type FileSystem,
  type HttpClient,
  type Logger,
  type ProcessRunner,
} from '@qa-ai-stlc/core';
import type { CliIO } from './cli-io.js';

/**
 * Everything a command needs, injected so commands are testable without real I/O, a real clock
 * or a real child process (AGENTS.md 5.3). `runCli` builds one context per invocation from the
 * real Node adapters; tests build one from fakes.
 */
export interface CommandContext {
  readonly projectRoot: string;
  readonly io: CliIO;
  readonly json: boolean;
  readonly fs: FileSystem;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly processRunner: ProcessRunner;
  readonly httpClient: HttpClient;
  readonly browserLauncher: BrowserLauncher;
  readonly env: Readonly<Record<string, string | undefined>>;
}

export interface CreateCommandContextOptions {
  readonly projectRoot: string;
  readonly io: CliIO;
  readonly json?: boolean;
  readonly fs?: FileSystem;
  readonly clock?: Clock;
  readonly logger?: Logger;
  readonly processRunner?: ProcessRunner;
  readonly httpClient?: HttpClient;
  readonly browserLauncher?: BrowserLauncher;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export function createCommandContext(options: CreateCommandContextOptions): CommandContext {
  return {
    projectRoot: options.projectRoot,
    io: options.io,
    json: options.json ?? false,
    fs: options.fs ?? nodeFileSystem,
    clock: options.clock ?? systemClock,
    logger: options.logger ?? noopLogger,
    processRunner: options.processRunner ?? nodeProcessRunner,
    httpClient: options.httpClient ?? fetchHttpClient,
    browserLauncher: options.browserLauncher ?? playwrightBrowserLauncher,
    env: options.env ?? process.env,
  };
}
