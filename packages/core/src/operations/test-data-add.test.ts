// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { noopLogger } from '../ports/logger.js';
import { systemClock } from '../ports/clock.js';
import { createFakeBrowserLauncher } from '../test-support/fake-browser-launcher.js';
import { createFakeFileSystem } from '../test-support/fake-file-system.js';
import { createFakeHttpClient } from '../test-support/fake-http-client.js';
import { createFakeProcessRunner } from '../test-support/fake-process-runner.js';
import { runTestDataAdd } from './test-data-add.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

function testDataJson(overrides: { id?: string; feature?: string }): string {
  return JSON.stringify({
    id: overrides.id ?? 'valid-checkout-card',
    feature: overrides.feature ?? 'checkout',
    values: { cardNumber: '4111111111111111', expiry: '12/30' },
  });
}

function fakeContext(files: Readonly<Record<string, string>> = {}): EngineContext {
  return {
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem(files),
    clock: systemClock,
    logger: noopLogger,
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeBrowserLauncher(),
    env: {},
  };
}

describe('runTestDataAdd', () => {
  it('registers a test-data set under its feature folder', async () => {
    const context = fakeContext({
      [join(PROJECT_ROOT, 'card.json')]: testDataJson({}),
    });

    const result = await runTestDataAdd(context, { path: 'card.json' });

    expect(result).toEqual({
      testDataPath: 'artifacts/test-data/checkout/valid-checkout-card.json',
      id: 'valid-checkout-card',
    });
    const written = JSON.parse(
      await context.fs.readFile(
        join(QA_DIR, 'artifacts', 'test-data', 'checkout', 'valid-checkout-card.json'),
      ),
    ) as { id: string };
    expect(written.id).toBe('valid-checkout-card');
  });

  it('registers the test-data artifact in the manifest', async () => {
    const context = fakeContext({
      [join(PROJECT_ROOT, 'card.json')]: testDataJson({}),
    });

    await runTestDataAdd(context, { path: 'card.json' });

    const manifest = JSON.parse(await context.fs.readFile(join(QA_DIR, 'manifest.json'))) as {
      artifacts: Record<string, unknown>;
    };
    expect(manifest.artifacts).toHaveProperty('artifacts/test-data/checkout/valid-checkout-card.json');
  });

  it('rejects a test-data file that fails schema validation', async () => {
    const context = fakeContext({
      [join(PROJECT_ROOT, 'card.json')]: JSON.stringify({ id: 'x', feature: 'checkout', values: {} }),
    });

    await expect(runTestDataAdd(context, { path: 'card.json' })).rejects.toThrow(QaError);
  });

  it('rejects no --path given', async () => {
    const context = fakeContext();

    await expect(runTestDataAdd(context, {})).rejects.toThrow(QaError);
  });

  it('rejects a --path that does not exist', async () => {
    const context = fakeContext();

    await expect(runTestDataAdd(context, { path: 'missing.json' })).rejects.toThrow(QaError);
  });

  it('rejects a --path outside the project', async () => {
    const context = fakeContext();

    await expect(runTestDataAdd(context, { path: '../outside.json' })).rejects.toThrow(QaError);
  });
});
