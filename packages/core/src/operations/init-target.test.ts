// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join, resolve } from 'node:path';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { describe, expect, it } from 'vitest';
import { QaError } from '../errors.js';
import { createFakeEngineContext } from '../test-support/fake-engine-context.js';
import { planProjectInit } from './init-target.js';

const PARENT = resolve('workspace');
const CHILD = join(PARENT, 'app');

describe('planProjectInit', () => {
  it('returns the absolute project root when no .qa exists there or above', async () => {
    const context = createFakeEngineContext({ projectRoot: CHILD, fs: createFakeFileSystem() });

    expect(await planProjectInit(context)).toStrictEqual({ projectRoot: CHILD });
  });

  it('refuses when .qa already exists in the directory', async () => {
    const fs = createFakeFileSystem();
    await fs.mkdir(join(CHILD, '.qa'));
    const context = createFakeEngineContext({ projectRoot: CHILD, fs });

    const error = await planProjectInit(context).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('INIT_ALREADY_INITIALIZED');
    expect((error as QaError).remediation).toContain('qa.config_set');
  });

  it('refuses when .qa exists in a parent directory, naming that directory', async () => {
    const fs = createFakeFileSystem();
    await fs.mkdir(join(PARENT, '.qa'));
    const context = createFakeEngineContext({ projectRoot: CHILD, fs });

    const error = await planProjectInit(context).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).message).toContain(PARENT);
    expect((error as QaError).remediation).toContain('outside it');
  });
});
