// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { existsSync } from 'node:fs';
import {
  fetchHttpClient,
  nodeFileSystem,
  nodeProcessRunner,
  noopLogger,
  playwrightBrowserLauncher,
  resolveProjectRoot,
  systemClock,
  type EngineContext,
} from '@qa-ai-stlc/core';

/**
 * Builds an `EngineContext` from the real Node adapters, freshly on every call rather than once
 * at import time (AGENTS.md 5.3: no side effects on import), so it always reflects the process's
 * current working directory and environment. The project root is the nearest directory from the
 * working directory upward that holds `.qa/` (the search `qa-start` states to the operator), or
 * the working directory itself when there is none, so no tool acts on a different directory than
 * the one the operator confirmed.
 */
export function createNodeEngineContext(): EngineContext {
  return {
    projectRoot: resolveProjectRoot(process.cwd(), existsSync),
    fs: nodeFileSystem,
    clock: systemClock,
    logger: noopLogger,
    processRunner: nodeProcessRunner,
    httpClient: fetchHttpClient,
    browserLauncher: playwrightBrowserLauncher,
    env: process.env,
  };
}
