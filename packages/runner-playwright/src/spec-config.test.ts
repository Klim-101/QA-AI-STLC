// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeCommonDirectory, generateSpecConfigSource } from './spec-config.js';

describe('computeCommonDirectory', () => {
  it("returns the sole file's own directory when only one path is given", () => {
    const path = join('project', 'specs', 'a.spec.ts');
    expect(computeCommonDirectory([path])).toBe(join('project', 'specs'));
  });

  it('returns the shared parent of files under different subdirectories', () => {
    const a = join('project', 'specs', 'auth', 'login.spec.ts');
    const b = join('project', 'specs', 'dashboard', 'widgets.spec.ts');
    expect(computeCommonDirectory([a, b])).toBe(join('project', 'specs'));
  });

  it('throws when given no paths', () => {
    expect(() => computeCommonDirectory([])).toThrow();
  });
});

describe('generateSpecConfigSource', () => {
  it('emits an import-free config module listing each spec relative to testDir', () => {
    const specFiles = [join('project', 'specs', 'a.spec.ts'), join('project', 'specs', 'b.spec.ts')];
    const { source, testDir } = generateSpecConfigSource({
      baseUrl: 'http://localhost:4310/',
      specFiles,
      reportPath: join('tmp', 'report.json'),
      outputDir: join('tmp', 'test-results'),
    });

    expect(testDir).toBe(join('project', 'specs'));
    expect(source).not.toContain('import');
    expect(source).toContain('"testMatch"');
    expect(source).toContain('"a.spec.ts"');
    expect(source).toContain('"b.spec.ts"');
    expect(source).toContain('"baseURL": "http://localhost:4310/"');
    expect(source).toContain('"outputDir"');
  });
});
