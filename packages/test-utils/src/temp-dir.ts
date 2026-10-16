// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Creates a fresh temporary directory prefixed with `qa-ai-stlc-`, runs `use` against it, and
 * always removes it afterward, including when `use` throws. Never touches the developer's home
 * directory or real host configuration (AGENTS.md section 13).
 */
export async function withTempDir<T>(use: (directoryPath: string) => Promise<T>): Promise<T> {
  const directoryPath = await mkdtemp(join(tmpdir(), 'qa-ai-stlc-'));
  try {
    return await use(directoryPath);
  } finally {
    // A file deleted a moment earlier can still be "delete pending" on Windows, which fails the
    // removal of its folder once; waiting briefly clears it.
    await rm(directoryPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}
