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
    expect(source).toContain('"testIdAttribute": "data-testid"');
    expect(source).toContain('"outputDir"');
  });

  it('configures getByTestId() to resolve against a non-default attribute when given (#419)', () => {
    const { source } = generateSpecConfigSource({
      baseUrl: 'http://localhost:4310/',
      specFiles: [join('project', 'specs', 'a.spec.ts')],
      reportPath: join('tmp', 'report.json'),
      outputDir: join('tmp', 'test-results'),
      testIdAttribute: 'data-ui-id',
    });

    expect(source).toContain('"testIdAttribute": "data-ui-id"');
  });

  it('starts every browser context in the given locale, and in the host locale when none is given (P6-114)', () => {
    const options = {
      baseUrl: 'http://localhost:4310/',
      specFiles: [join('project', 'specs', 'a.spec.ts')],
      reportPath: join('tmp', 'report.json'),
      outputDir: join('tmp', 'test-results'),
    };

    expect(generateSpecConfigSource({ ...options, locale: 'es-ES' }).source).toContain('"locale": "es-ES"');
    expect(generateSpecConfigSource(options).source).not.toContain('locale');
  });

  it('bounds parallelism and the per-test timeout only when asked, leaving Playwright defaults otherwise', () => {
    const options = {
      baseUrl: 'http://localhost:4310/',
      specFiles: [join('project', 'specs', 'a.spec.ts')],
      reportPath: join('tmp', 'report.json'),
      outputDir: join('tmp', 'test-results'),
    };

    const bounded = generateSpecConfigSource({ ...options, workers: 2, testTimeoutMs: 90_000 }).source;
    expect(bounded).toContain('"workers": 2');
    expect(bounded).toContain('"timeout": 90000');
    const defaults = generateSpecConfigSource(options).source;
    expect(defaults).not.toContain('workers');
    expect(defaults).not.toContain('"timeout"');
  });

  it.each([
    [undefined, 'retain-on-failure'],
    [true, 'retain-on-failure'],
    [false, 'off'],
  ])('sets the trace mode for isTraceEnabled=%s', (isTraceEnabled, expected) => {
    const { source } = generateSpecConfigSource({
      baseUrl: 'http://localhost:4310/',
      specFiles: [join('project', 'specs', 'a.spec.ts')],
      reportPath: join('tmp', 'report.json'),
      outputDir: join('tmp', 'test-results'),
      ...(isTraceEnabled !== undefined ? { isTraceEnabled } : {}),
    });

    expect(source).toContain(`"trace": "${expected}"`);
  });

  it('starts every context from the storage-state file when given one (P6-89)', () => {
    const base = {
      baseUrl: 'http://localhost:4310/',
      specFiles: [join('project', 'specs', 'a.spec.ts')],
      reportPath: join('tmp', 'report.json'),
      outputDir: join('tmp', 'test-results'),
    };
    const signedIn = generateSpecConfigSource({
      ...base,
      storageStatePath: join('tmp', 'storage-state.json'),
    });
    const anonymous = generateSpecConfigSource(base);

    expect(signedIn.source).toContain('"storageState"');
    expect(signedIn.source).toContain('storage-state.json');
    expect(anonymous.source).not.toContain('storageState');
  });

  it('runs only the JSON reporter unless a step-work reporter is asked for', () => {
    const { source } = generateSpecConfigSource({
      baseUrl: 'http://localhost:4310/',
      specFiles: [join('project', 'specs', 'a.spec.ts')],
      reportPath: join('tmp', 'report.json'),
      outputDir: join('tmp', 'test-results'),
    });

    expect(source).not.toContain('step-work');
  });

  it('adds the step-work reporter with its output file when asked for', () => {
    const { source } = generateSpecConfigSource({
      baseUrl: 'http://localhost:4310/',
      specFiles: [join('project', 'specs', 'a.spec.ts')],
      reportPath: join('tmp', 'report.json'),
      outputDir: join('tmp', 'test-results'),
      stepWork: {
        reporterPath: join('dist', 'step-work-reporter.js'),
        outputFile: join('tmp', 'step-work.json'),
      },
    });

    const config = JSON.parse(source.replace('export default ', '').replace(/;\s*$/, '')) as {
      reporter: [string, { outputFile: string }][];
    };
    expect(config.reporter.map(([name]) => name)).toEqual(['json', join('dist', 'step-work-reporter.js')]);
    expect(config.reporter[1]?.[1]).toEqual({ outputFile: join('tmp', 'step-work.json') });
  });
});
