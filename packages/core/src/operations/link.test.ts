// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { hashText } from '../hash.js';
import { systemClock } from '../ports/clock.js';
import { noopLogger } from '../ports/logger.js';
import { createSequentialIdGenerator } from '../test-support/fake-id-generator.js';
import { runLink } from './link.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

function scopeJson(): string {
  return JSON.stringify({
    generatedAt: '2026-09-20T12:00:00Z',
    requirements: [{ id: 'r1', title: 'R1', source: { kind: 'text', label: 'x' }, inScope: true }],
  });
}

/** A `.qa/manifest.json` registering `artifacts/scope.json`, as a real prior `qa scope` call would. */
function manifestRegisteringScope(scopeContent: string): string {
  return JSON.stringify({
    schemaVersion: 1,
    artifacts: {
      'artifacts/scope.json': {
        sha256: hashText(scopeContent),
        mode: 'text',
        registeredAt: '2026-09-20T12:00:00Z',
      },
    },
  });
}

const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
  'environments: {}',
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

function fakeContext(files: Readonly<Record<string, string>> = {}): EngineContext {
  const configPath = join(QA_DIR, 'config.yaml');
  return {
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem({ [configPath]: CONFIG_YAML, ...files }),
    clock: systemClock,
    logger: noopLogger,
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeBrowserLauncher(),
    env: {},
  };
}

const HAND_WRITTEN_SPEC_NO_ANNOTATION = `
import { test, expect } from '@playwright/test';
test('logs in', async ({ page }) => {
  await page.goto('/login');
});
`;

const HAND_WRITTEN_SPEC_WITH_ANNOTATION = `
import { test, expect } from '@playwright/test';
test('logs in', { annotation: { type: 'testCaseId', description: 'existing-case-1' } }, async ({ page }) => {
  await page.goto('/login');
});
`;

describe('runLink', () => {
  it('registers a case linking a hand-written spec to a requirement, minting a fresh id when the spec has no annotation', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'manifest.json')]: manifestRegisteringScope(scopeJson()),
      [join(PROJECT_ROOT, 'tests', 'login.spec.ts')]: HAND_WRITTEN_SPEC_NO_ANNOTATION,
    });

    const result = await runLink(context, {
      specFile: 'tests/login.spec.ts',
      requirementId: 'r1',
      feature: 'login',
      idGenerator: createSequentialIdGenerator('id'),
    });

    expect(result).toEqual({
      testCaseId: 'test-case-id-1',
      casePath: 'artifacts/cases/login/test-case-id-1.json',
      requirementId: 'r1',
      annotationFound: false,
    });
    const written = JSON.parse(
      await context.fs.readFile(join(QA_DIR, 'artifacts', 'cases', 'login', 'test-case-id-1.json')),
    ) as { requirementIds: string[]; feature: string };
    expect(written.requirementIds).toEqual(['r1']);
    expect(written.feature).toBe('login');
  });

  it('reuses the spec’s own testCaseId annotation instead of minting a fresh id', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'manifest.json')]: manifestRegisteringScope(scopeJson()),
      [join(PROJECT_ROOT, 'tests', 'login.spec.ts')]: HAND_WRITTEN_SPEC_WITH_ANNOTATION,
    });

    const result = await runLink(context, {
      specFile: 'tests/login.spec.ts',
      requirementId: 'r1',
      feature: 'login',
    });

    expect(result).toEqual({
      testCaseId: 'existing-case-1',
      casePath: 'artifacts/cases/login/existing-case-1.json',
      requirementId: 'r1',
      annotationFound: true,
    });
  });

  it('registers the case artifact in the manifest', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'manifest.json')]: manifestRegisteringScope(scopeJson()),
      [join(PROJECT_ROOT, 'tests', 'login.spec.ts')]: HAND_WRITTEN_SPEC_WITH_ANNOTATION,
    });

    await runLink(context, { specFile: 'tests/login.spec.ts', requirementId: 'r1', feature: 'login' });

    const manifest = JSON.parse(await context.fs.readFile(join(QA_DIR, 'manifest.json'))) as {
      artifacts: Record<string, unknown>;
    };
    expect(manifest.artifacts).toHaveProperty('artifacts/cases/login/existing-case-1.json');
  });

  it('defaults testType to e2e', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'manifest.json')]: manifestRegisteringScope(scopeJson()),
      [join(PROJECT_ROOT, 'tests', 'login.spec.ts')]: HAND_WRITTEN_SPEC_WITH_ANNOTATION,
    });

    await runLink(context, { specFile: 'tests/login.spec.ts', requirementId: 'r1', feature: 'login' });

    const written = JSON.parse(
      await context.fs.readFile(join(QA_DIR, 'artifacts', 'cases', 'login', 'existing-case-1.json')),
    ) as { testType: string };
    expect(written.testType).toBe('e2e');
  });

  it('honors an explicit testType', async () => {
    const yaml = [
      'schemaVersion: 1',
      'testing: { e2e: in-scope, api: in-scope, a11y: out-of-scope, security: out-of-scope }',
      'api: { contract: openapi, source: discover }',
      'environments: {}',
      'identities: {}',
      'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
      'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
      'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
      '',
    ].join('\n');
    const context = fakeContext({
      [join(QA_DIR, 'config.yaml')]: yaml,
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'manifest.json')]: manifestRegisteringScope(scopeJson()),
      [join(PROJECT_ROOT, 'tests', 'login.spec.ts')]: HAND_WRITTEN_SPEC_WITH_ANNOTATION,
    });

    await runLink(context, {
      specFile: 'tests/login.spec.ts',
      requirementId: 'r1',
      feature: 'login',
      testType: 'api',
    });

    const written = JSON.parse(
      await context.fs.readFile(join(QA_DIR, 'artifacts', 'cases', 'login', 'existing-case-1.json')),
    ) as { testType: string };
    expect(written.testType).toBe('api');
  });

  it('rejects a spec type that is out of scope', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'manifest.json')]: manifestRegisteringScope(scopeJson()),
      [join(PROJECT_ROOT, 'tests', 'login.spec.ts')]: HAND_WRITTEN_SPEC_WITH_ANNOTATION,
    });

    const error = await runLink(context, {
      specFile: 'tests/login.spec.ts',
      requirementId: 'r1',
      feature: 'login',
      testType: 'a11y',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('LINK_TYPE_OUT_OF_SCOPE');
  });

  it('rejects while any testing type is still undecided (P2-16)', async () => {
    const undecidedYaml = CONFIG_YAML.replace('api: out-of-scope', 'api: undecided');
    const context = fakeContext({
      [join(QA_DIR, 'config.yaml')]: undecidedYaml,
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'manifest.json')]: manifestRegisteringScope(scopeJson()),
      [join(PROJECT_ROOT, 'tests', 'login.spec.ts')]: HAND_WRITTEN_SPEC_WITH_ANNOTATION,
    });

    const error = await runLink(context, {
      specFile: 'tests/login.spec.ts',
      requirementId: 'r1',
      feature: 'login',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('LINK_TESTING_UNDECIDED');
  });

  it('rejects a requirement id not in the scope artifact', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'manifest.json')]: manifestRegisteringScope(scopeJson()),
      [join(PROJECT_ROOT, 'tests', 'login.spec.ts')]: HAND_WRITTEN_SPEC_WITH_ANNOTATION,
    });

    const error = await runLink(context, {
      specFile: 'tests/login.spec.ts',
      requirementId: 'missing',
      feature: 'login',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('LINK_UNLINKED_REQUIREMENT');
  });

  it('rejects a requirement id when there is no scope artifact at all', async () => {
    const context = fakeContext({
      [join(PROJECT_ROOT, 'tests', 'login.spec.ts')]: HAND_WRITTEN_SPEC_WITH_ANNOTATION,
    });

    const error = await runLink(context, {
      specFile: 'tests/login.spec.ts',
      requirementId: 'r1',
      feature: 'login',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('LINK_UNLINKED_REQUIREMENT');
  });

  it('rejects a spec file that does not exist', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'manifest.json')]: manifestRegisteringScope(scopeJson()),
    });

    const error = await runLink(context, {
      specFile: 'tests/missing.spec.ts',
      requirementId: 'r1',
      feature: 'login',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('LINK_SPEC_NOT_FOUND');
  });

  it('rejects a spec path outside the project', async () => {
    const context = fakeContext();

    await expect(
      runLink(context, { specFile: '../outside.spec.ts', requirementId: 'r1', feature: 'login' }),
    ).rejects.toThrow(QaError);
  });

  it('rejects a feature that is not kebab-case', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'manifest.json')]: manifestRegisteringScope(scopeJson()),
      [join(PROJECT_ROOT, 'tests', 'login.spec.ts')]: HAND_WRITTEN_SPEC_WITH_ANNOTATION,
    });

    const error = await runLink(context, {
      specFile: 'tests/login.spec.ts',
      requirementId: 'r1',
      feature: 'Not_Kebab',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('LINK_INVALID_CASE');
  });

  it('rejects missing specFile, requirementId or feature', async () => {
    const context = fakeContext();

    const error = await runLink(context, { requirementId: 'r1', feature: 'login' }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('LINK_USAGE');
  });
});
