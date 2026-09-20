// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  fetchHttpClient,
  nodeFileSystem,
  nodeProcessRunner,
  noopLogger,
  playwrightBrowserLauncher,
  systemClock,
  type EngineContext,
} from '@qa-ai-stlc/core';

/**
 * Builds an `EngineContext` from the real Node adapters, freshly on every call rather than once
 * at import time (AGENTS.md 5.3: no side effects on import), so it always reflects the process's
 * current working directory and environment.
 */
export function createNodeEngineContext(): EngineContext {
  return {
    projectRoot: process.cwd(),
    fs: nodeFileSystem,
    clock: systemClock,
    logger: noopLogger,
    processRunner: nodeProcessRunner,
    httpClient: fetchHttpClient,
    browserLauncher: playwrightBrowserLauncher,
    env: process.env,
  };
}
