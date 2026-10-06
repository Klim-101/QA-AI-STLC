// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { DEFAULT_A11Y_CONFIG } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import {
  A11Y_SCAN_ATTACHMENT_CONTENT_TYPE,
  A11Y_SCAN_ENVIRONMENT_VARIABLE,
  A11Y_SCAN_MODULE_PATH,
  ensureA11yScanModule,
  generateA11yScanModule,
  resolveAxeSourcePath,
  serializeA11yScanPlan,
} from './a11y-scan-module.js';
import type { EngineContext } from './engine-context.js';
import { planAxeRun } from './operations/a11y-scan-plan.js';

function engineWith(files: Record<string, string> = {}): EngineContext {
  return {
    projectRoot: 'project',
    fs: createFakeFileSystem(files),
    clock: { now: () => new Date('2026-10-06T12:00:00Z') },
    logger: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeBrowserLauncher(),
    env: {},
  };
}

describe('generateA11yScanModule', () => {
  it('reads the plan from the run-time variable and attaches the raw result under the engine content type', () => {
    const source = generateA11yScanModule();

    expect(source).toContain(`process.env['${A11Y_SCAN_ENVIRONMENT_VARIABLE}']`);
    expect(source).toContain(A11Y_SCAN_ATTACHMENT_CONTENT_TYPE);
    expect(source).toContain('export async function scanAccessibility(page: Page, testInfo: TestInfo)');
  });
});

describe('ensureA11yScanModule', () => {
  const absolutePath = join('project', ...A11Y_SCAN_MODULE_PATH.split('/'));

  it('writes the helper when it is missing', async () => {
    const engine = engineWith();

    const result = await ensureA11yScanModule(engine);

    expect(result).toEqual({ path: A11Y_SCAN_MODULE_PATH, didWrite: true });
    expect(await engine.fs.readFile(absolutePath)).toBe(generateA11yScanModule());
  });

  it('rewrites a helper that differs from the generated one', async () => {
    const engine = engineWith({ [absolutePath]: '// stale' });

    const result = await ensureA11yScanModule(engine);

    expect(result.didWrite).toBe(true);
    expect(await engine.fs.readFile(absolutePath)).toBe(generateA11yScanModule());
  });

  it('leaves a current helper alone', async () => {
    const engine = engineWith({ [absolutePath]: generateA11yScanModule() });

    expect((await ensureA11yScanModule(engine)).didWrite).toBe(false);
  });
});

describe('resolveAxeSourcePath', () => {
  it('points at the browser script axe-core ships', () => {
    expect(resolveAxeSourcePath()).toMatch(/axe-core[\\/]axe\.js$/u);
  });
});

describe('serializeA11yScanPlan', () => {
  it('passes the tags, the rules to enable and the script path, with no context for the whole page', () => {
    const plan = planAxeRun(DEFAULT_A11Y_CONFIG);

    const parsed = JSON.parse(serializeA11yScanPlan(plan, '/axe.js')) as Record<string, unknown>;

    expect(parsed).toMatchObject({
      axePath: '/axe.js',
      options: { runOnly: { type: 'tag', values: plan.tags } },
    });
    expect(parsed).not.toHaveProperty('context');
    expect(Object.keys((parsed.options as { rules: object }).rules)).toEqual(plan.ruleIds);
  });

  it('narrows the context to the configured include and exclude selectors', () => {
    const plan = planAxeRun({ ...DEFAULT_A11Y_CONFIG, include: ['main'], exclude: ['.ads'] });

    const parsed = JSON.parse(serializeA11yScanPlan(plan, '/axe.js')) as Record<string, unknown>;

    expect(parsed.context).toEqual({ include: [['main']], exclude: [['.ads']] });
  });
});
