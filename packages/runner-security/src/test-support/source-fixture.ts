// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import type { ProcessRunner } from '@qa-ai-stlc/core';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { SourceCheckout, type SourceCheckoutOptions } from '../source-checkout.js';

export const FIXTURE_PROJECT_ROOT = 'project';

const NO_PROCESS_RUNNER: ProcessRunner = {
  run: () => Promise.reject(new Error('This test did not expect a process to be started')),
};

/**
 * A `SourceCheckout` over an in-memory project. `files` are keyed by project-relative path with `/`
 * separators, so a test reads like the checkout it describes.
 */
export function sourceFixture(
  files: Readonly<Record<string, string | Uint8Array>>,
  options: {
    readonly relativeRoot?: string;
    readonly processRunner?: ProcessRunner;
    readonly maxFiles?: number;
    readonly maxFileSizeBytes?: number;
  } = {},
): SourceCheckout {
  const absolute = (path: string): string => join(FIXTURE_PROJECT_ROOT, ...path.split('/'));
  const entries = Object.entries(files);
  const fs = createFakeFileSystem(
    Object.fromEntries(
      entries.flatMap(([path, content]) => (typeof content === 'string' ? [[absolute(path), content]] : [])),
    ),
  );
  for (const [path, content] of entries) {
    if (typeof content !== 'string') {
      // The in-memory file system settles synchronously.
      void fs.writeFile(absolute(path), content);
    }
  }
  const checkoutOptions: SourceCheckoutOptions = {
    projectRoot: FIXTURE_PROJECT_ROOT,
    relativeRoot: options.relativeRoot ?? 'app',
    fs,
    processRunner: options.processRunner ?? NO_PROCESS_RUNNER,
    ...(options.maxFiles !== undefined ? { maxFiles: options.maxFiles } : {}),
    ...(options.maxFileSizeBytes !== undefined ? { maxFileSizeBytes: options.maxFileSizeBytes } : {}),
  };
  return new SourceCheckout(checkoutOptions);
}
