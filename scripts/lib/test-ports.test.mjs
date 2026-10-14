// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractPorts, findDuplicatePorts, findDuplicatePortsUnder, listTestFiles } from './test-ports.mjs';

describe('extractPorts', () => {
  it('reads a PORT constant and a literal given to startDemoApp', () => {
    const source = ['const PORT = 9001;', 'await startDemoApp(9002);', 'startDemoApp( 9003 , options)'].join(
      '\n',
    );

    expect(extractPorts(source)).toEqual([9001, 9002, 9003]);
  });

  it('ignores a port that is computed, a short number and unrelated numbers', () => {
    const source = [
      'const PORT = 0;',
      'startDemoApp(PORT);',
      'const TIMEOUT = 60000;',
      'const SUPPORT = 9001;',
    ].join('\n');

    expect(extractPorts(source)).toEqual([]);
  });
});

describe('findDuplicatePorts', () => {
  it('names each port held by more than one file, with the files', () => {
    const files = [
      { path: 'b.test.ts', content: 'const PORT = 9002;' },
      { path: 'a.test.ts', content: 'const PORT = 9002;' },
      { path: 'c.test.ts', content: 'const PORT = 9003;' },
      { path: 'd.test.ts', content: 'const PORT = 9004;\nconst PORT = 9004;' },
      { path: 'e.test.ts', content: 'const PORT = 9004;' },
    ];

    expect(findDuplicatePorts(files)).toEqual([
      { port: 9002, paths: ['a.test.ts', 'b.test.ts'] },
      { port: 9004, paths: ['d.test.ts', 'e.test.ts'] },
    ]);
  });

  it('does not count one file that mentions its port twice', () => {
    const files = [{ path: 'a.test.ts', content: 'const PORT = 9002;\nawait startDemoApp(9002);' }];

    expect(findDuplicatePorts(files)).toEqual([]);
  });
});

describe('listTestFiles', () => {
  it('lists test files of packages, examples and scripts, and skips build output and dependencies', () => {
    const root = mkdtempSync(join(tmpdir(), 'qa-test-ports-'));
    try {
      const write = (path) => {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), '');
      };
      write('packages/a/test/one.test.ts');
      write('packages/a/src/two.test.ts');
      write('packages/a/dist/three.test.ts');
      write('packages/a/node_modules/x/four.test.ts');
      write('packages/a/.scratch/five.test.ts');
      write('packages/a/src/not-a-test.ts');
      write('scripts/lib/six.test.mjs');
      write('examples/demo/seven.test.ts');
      write('docs/eight.test.ts');

      expect(listTestFiles(root)).toEqual([
        'examples/demo/seven.test.ts',
        'packages/a/src/two.test.ts',
        'packages/a/test/one.test.ts',
        'scripts/lib/six.test.mjs',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('the repository', () => {
  it('gives every demo-app test file a port of its own', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

    expect(findDuplicatePortsUnder(root)).toEqual([]);
  });
});
