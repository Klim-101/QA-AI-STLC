// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PipelineStateStore } from './state-store.js';
import { QaStore } from './qa-store.js';
import { createFakeFileSystem } from './test-support/fake-file-system.js';

function createStateStore(): PipelineStateStore {
  const store = new QaStore({ projectRoot: join('project'), fs: createFakeFileSystem() });
  return new PipelineStateStore({ store });
}

describe('PipelineStateStore', () => {
  it('defaults to the first phase with every gate open when no state has been saved', async () => {
    const state = await createStateStore().load();

    expect(state).toEqual({
      schemaVersion: 1,
      currentPhase: 'scope',
      gates: { scope: { status: 'open' }, cases: { status: 'open' } },
    });
  });

  it('loads back exactly what was saved', async () => {
    const stateStore = createStateStore();
    const saved = {
      schemaVersion: 1 as const,
      currentPhase: 'cases' as const,
      gates: { scope: { status: 'satisfied' as const }, cases: { status: 'open' as const } },
    };

    await stateStore.save(saved);

    expect(await stateStore.load()).toEqual(saved);
  });
});
