// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join, relative } from 'node:path';
import { RelativePathSchema, type RelativePath } from '@qa-ai-stlc/schemas';
import { QaError } from './errors.js';

/**
 * Validates and returns a project-relative path (AGENTS.md 5.6): forward-slash separators, no
 * leading slash, no ".." segment. Throws `QaError` rather than a bare Zod error so callers get a
 * stable `code` regardless of which artifact schema is involved.
 */
export function assertRelativePath(value: string): RelativePath {
  const result = RelativePathSchema.safeParse(value);
  if (!result.success) {
    throw new QaError('INVALID_RELATIVE_PATH', `"${value}" is not a valid project-relative path`, {
      remediation: 'Use a forward-slash path relative to the store root with no ".." segment.',
    });
  }
  return result.data;
}

/**
 * Computes the path from `rootDir` to `absolutePath` in the canonical forward-slash form
 * artifacts are hashed and referenced by, independent of the host OS path separator.
 */
export function toRelativePath(rootDir: string, absolutePath: string): RelativePath {
  const posixPath = relative(rootDir, absolutePath).split('\\').join('/');
  return assertRelativePath(posixPath);
}

/** Resolves a validated project-relative path to an absolute, OS-native path under `rootDir`. */
export function resolveRelativePath(rootDir: string, relativePath: RelativePath): string {
  assertRelativePath(relativePath);
  return join(rootDir, ...relativePath.split('/'));
}
