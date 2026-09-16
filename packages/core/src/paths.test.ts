// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QaError } from './errors.js';
import { assertRelativePath, resolveRelativePath, toRelativePath } from './paths.js';

describe('assertRelativePath', () => {
  it('accepts a forward-slash relative path', () => {
    expect(assertRelativePath('artifacts/scope.json')).toBe('artifacts/scope.json');
  });

  it('rejects an absolute path with a coded QaError', () => {
    expect(() => assertRelativePath('/etc/passwd')).toThrow(QaError);
  });

  it('rejects a path with a ".." segment', () => {
    try {
      assertRelativePath('../outside.json');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(QaError);
      expect((error as QaError).code).toBe('INVALID_RELATIVE_PATH');
      expect((error as QaError).remediation).toBeDefined();
    }
  });
});

describe('resolveRelativePath and toRelativePath', () => {
  it('resolve to an OS-native absolute path and back to the same relative path', () => {
    const root = join('project-root', '.qa');
    const relativePath = 'artifacts/scope.json';

    const absolutePath = resolveRelativePath(root, relativePath);

    expect(absolutePath).toBe(join(root, 'artifacts', 'scope.json'));
    expect(toRelativePath(root, absolutePath)).toBe(relativePath);
  });

  it('produces forward slashes for a nested relative path on every OS', () => {
    const root = join('root');
    const absolutePath = join(root, 'selectors', 'registry', 'page.json');

    const relativePath = toRelativePath(root, absolutePath);

    expect(relativePath).toBe('selectors/registry/page.json');
    expect(relativePath).not.toContain('\\');
  });

  it('rejects resolving an invalid relative path', () => {
    expect(() => resolveRelativePath('root', '/absolute')).toThrow(QaError);
  });
});
