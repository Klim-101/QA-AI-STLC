// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import type { EngineContext } from '@qa-ai-stlc/core';
import { SCHEMA_VERSION, type SelectorElement, type SelectorRegistry } from '@qa-ai-stlc/schemas';
import { createFakeExploreBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-explore-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { describe, expect, it } from 'vitest';
import { runSyncLocatorModule } from './sync-locator-module.js';

const PROJECT_ROOT = join('project');
const REGISTRY_PATH = join(PROJECT_ROOT, '.qa', 'selectors', 'registry.json');
const MODULE_PATH = join(PROJECT_ROOT, 'tests', 'qa', 'locators.ts');
const MANIFEST_PATH = join(PROJECT_ROOT, '.qa', 'manifest.json');

function element(overrides: Partial<SelectorElement>): SelectorElement {
  return {
    elementId: 'el-1',
    name: 'logIn',
    kind: 'button',
    locatorCandidates: [{ strategy: 'testId', value: 'login-submit', fragile: false }],
    stabilityScore: 1,
    lastVerifiedAt: '2026-09-18T00:00:00Z',
    pii: false,
    dynamicText: false,
    source: 'crawl',
    pageUrl: 'https://staging.example.com/login',
    ...overrides,
  };
}

function contextWith(elements: readonly SelectorElement[] | undefined): EngineContext {
  const registry: SelectorRegistry = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: '2026-09-18T00:00:00Z',
    elements: [...(elements ?? [])],
  };
  return {
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem(elements === undefined ? {} : { [REGISTRY_PATH]: JSON.stringify(registry) }),
    clock: { now: () => new Date('2026-09-20T12:00:00Z') },
    logger: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeExploreBrowserLauncher({}),
    env: {},
  };
}

describe('runSyncLocatorModule', () => {
  it('does nothing while there is no registry', async () => {
    const context = contextWith(undefined);

    const result = await runSyncLocatorModule(context);

    expect(result).toStrictEqual({ hasRegistry: false, isModuleRewritten: false, exports: [], skipped: [] });
    expect(await context.fs.pathExists(MODULE_PATH)).toBe(false);
  });

  it('exports an element that is in the registry but not in the module, and registers the module', async () => {
    const context = contextWith([
      element({}),
      element({
        elementId: 'el-session',
        name: 'productHeading',
        kind: 'heading',
        source: 'execute',
        locatorCandidates: [{ strategy: 'text', value: 'Backpack', fragile: false }],
      }),
    ]);

    const result = await runSyncLocatorModule(context);

    expect(result.isModuleRewritten).toBe(true);
    expect(result.exports.map((entry) => entry.elementId)).toStrictEqual(['el-1', 'el-session']);
    expect(await context.fs.readFile(MODULE_PATH)).toContain('export function productHeading(page: Page)');
    expect(await context.fs.readFile(MANIFEST_PATH)).toContain('tests/qa/locators.ts');
  });

  it('leaves a module that already matches the registry untouched', async () => {
    const context = contextWith([element({})]);
    await runSyncLocatorModule(context);
    const manifestBefore = await context.fs.readFile(MANIFEST_PATH);

    const result = await runSyncLocatorModule(context);

    expect(result.isModuleRewritten).toBe(false);
    expect(result.exports).toHaveLength(1);
    expect(await context.fs.readFile(MANIFEST_PATH)).toBe(manifestBefore);
  });

  it('rewrites a module that fell behind the registry', async () => {
    const context = contextWith([element({})]);
    await runSyncLocatorModule(context);
    await context.fs.writeFile(MODULE_PATH, '// stale\n');

    const result = await runSyncLocatorModule(context);

    expect(result.isModuleRewritten).toBe(true);
    expect(await context.fs.readFile(MODULE_PATH)).toContain('export function logIn(page: Page)');
  });

  it('reports an element that cannot be exported, with the reason', async () => {
    const context = contextWith([
      element({}),
      element({ elementId: 'el-bare', name: undefined, locatorCandidates: [] }),
    ]);

    const result = await runSyncLocatorModule(context);

    expect(result.skipped).toStrictEqual([
      { elementId: 'el-bare', kind: 'button', reason: 'no-locator-candidate' },
    ]);
  });
});
