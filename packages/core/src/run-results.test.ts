// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { describe, expect, it } from 'vitest';
import { QaStore } from './qa-store.js';
import { listInteractiveResultPaths, listRunResultPaths } from './run-results.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

describe('listRunResultPaths', () => {
  it('finds a result under "qa run"’s own "results/" layout', async () => {
    const store = new QaStore({
      projectRoot: PROJECT_ROOT,
      fs: createFakeFileSystem({
        [join(QA_DIR, 'runs', 'run-1', 'run.json')]: '{}',
        [join(QA_DIR, 'runs', 'run-1', 'results', 'result-1.json')]: '{}',
      }),
    });

    expect(await listRunResultPaths(store)).toEqual(['runs/run-1/results/result-1.json']);
  });

  it('finds a result under interactive case execution’s flat layout', async () => {
    const store = new QaStore({
      projectRoot: PROJECT_ROOT,
      fs: createFakeFileSystem({
        [join(QA_DIR, 'runs', 'case-1', 'result-1.json')]: '{}',
      }),
    });

    expect(await listRunResultPaths(store)).toEqual(['runs/case-1/result-1.json']);
  });

  it('returns an empty array when no runs are recorded yet', async () => {
    const store = new QaStore({ projectRoot: PROJECT_ROOT, fs: createFakeFileSystem() });

    expect(await listRunResultPaths(store)).toEqual([]);
  });
});

describe('listInteractiveResultPaths', () => {
  it('keeps only the flat layout interactive case execution writes', async () => {
    const store = new QaStore({
      projectRoot: PROJECT_ROOT,
      fs: createFakeFileSystem({
        [join(QA_DIR, 'runs', 'run-1', 'run.json')]: '{}',
        [join(QA_DIR, 'runs', 'run-1', 'results', 'result-1.json')]: '{}',
        [join(QA_DIR, 'runs', 'case-1', 'result-2.json')]: '{}',
      }),
    });

    expect(await listInteractiveResultPaths(store)).toEqual(['runs/case-1/result-2.json']);
  });
});
