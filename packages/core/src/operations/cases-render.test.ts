// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { noopLogger } from '../ports/logger.js';
import { systemClock } from '../ports/clock.js';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { runCasesRender } from './cases-render.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

function testCaseJson(overrides: { id?: string; feature?: string }): string {
  return JSON.stringify({
    id: overrides.id ?? 'case-1',
    feature: overrides.feature ?? 'checkout',
    requirementIds: ['r1'],
    testType: 'e2e',
    title: 'A case',
    steps: [{ description: 'Do something' }],
    expectedResult: 'Something happens',
    status: 'draft',
    createdAt: '2026-09-20T12:00:00Z',
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

describe('runCasesRender', () => {
  it('renders a registered test case to Markdown by id', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'cases', 'checkout', 'case-1.json')]: testCaseJson({ id: 'case-1' }),
    });

    const result = await runCasesRender(context, { id: 'case-1' });

    expect(result.casePath).toBe('artifacts/cases/checkout/case-1.json');
    expect(result.markdown).toContain('# A case');
    expect(result.markdown).toContain('**Feature:** checkout');
  });

  it('rejects no id given', async () => {
    const context = fakeContext();

    const error = await runCasesRender(context, {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('CASES_RENDER_USAGE');
  });

  it('rejects an id with no registered case', async () => {
    const context = fakeContext();

    const error = await runCasesRender(context, { id: 'missing' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('CASE_NOT_FOUND');
  });

  it('rejects an id registered under more than one feature', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'cases', 'checkout', 'case-1.json')]: testCaseJson({
        id: 'case-1',
        feature: 'checkout',
      }),
      [join(QA_DIR, 'artifacts', 'cases', 'billing', 'case-1.json')]: testCaseJson({
        id: 'case-1',
        feature: 'billing',
      }),
    });

    const error = await runCasesRender(context, { id: 'case-1' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('CASE_ID_AMBIGUOUS');
  });

  it('rejects a registered case file that fails schema validation', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'cases', 'checkout', 'case-1.json')]: JSON.stringify({ id: 'case-1' }),
    });

    await expect(runCasesRender(context, { id: 'case-1' })).rejects.toThrow(QaError);
  });
});
