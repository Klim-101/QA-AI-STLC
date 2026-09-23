// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { EngineContext } from '../engine-context.js';
import { systemClock } from '../ports/clock.js';
import { noopLogger } from '../ports/logger.js';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';

/** An `EngineContext` wired entirely to fakes, for operation tests (AGENTS.md 5.3, 13). */
export function createFakeEngineContext(overrides: Partial<EngineContext> = {}): EngineContext {
  return {
    projectRoot: 'project',
    fs: createFakeFileSystem(),
    clock: systemClock,
    logger: noopLogger,
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeBrowserLauncher(),
    env: {},
    ...overrides,
  };
}
