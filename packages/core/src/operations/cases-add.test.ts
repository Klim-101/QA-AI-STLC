// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { hashText } from '../hash.js';
import { noopLogger } from '../ports/logger.js';
import { systemClock } from '../ports/clock.js';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { runCasesAdd } from './cases-add.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

function testCaseJson(overrides: {
  id?: string;
  feature?: string;
  requirementIds: string[];
  testType?: 'e2e' | 'api';
  endpoints?: readonly { method: string; path: string }[];
}): string {
  return JSON.stringify({
    id: overrides.id ?? 'case-1',
    feature: overrides.feature ?? 'checkout',
    requirementIds: overrides.requirementIds,
    testType: overrides.testType ?? 'e2e',
    ...(overrides.endpoints === undefined ? {} : { endpoints: overrides.endpoints }),
    title: 'A case',
    steps: [{ description: 'Do something' }],
    expectedResult: 'Something happens',
    status: 'draft',
    createdAt: '2026-09-20T12:00:00Z',
  });
}

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

// `e2e` in-scope (every case in this file is `testType: 'e2e'`), everything else decided so
// P2-16's undecided check never blocks a test that is not about that check specifically.
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

describe('runCasesAdd', () => {
  it('registers a case whose requirement id resolves in the scope artifact', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'manifest.json')]: manifestRegisteringScope(scopeJson()),
      [join(PROJECT_ROOT, 'cases', 'login.json')]: testCaseJson({ id: 'case-1', requirementIds: ['r1'] }),
    });

    const result = await runCasesAdd(context, { path: 'cases/login.json' });

    expect(result).toEqual({
      casePath: 'artifacts/cases/checkout/case-1.json',
      markdownPath: 'artifacts/cases-md/checkout/case-1.md',
      id: 'case-1',
      requirementIds: ['r1'],
    });
    const written = JSON.parse(
      await context.fs.readFile(join(QA_DIR, 'artifacts', 'cases', 'checkout', 'case-1.json')),
    ) as { id: string };
    expect(written.id).toBe('case-1');
  });

  it('registers the case artifact in the manifest', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'manifest.json')]: manifestRegisteringScope(scopeJson()),
      [join(PROJECT_ROOT, 'cases', 'login.json')]: testCaseJson({ requirementIds: ['r1'] }),
    });

    await runCasesAdd(context, { path: 'cases/login.json' });

    const manifest = JSON.parse(await context.fs.readFile(join(QA_DIR, 'manifest.json'))) as {
      artifacts: Record<string, unknown>;
    };
    expect(manifest.artifacts).toHaveProperty('artifacts/cases/checkout/case-1.json');
  });

  it('rejects a case linking to a requirement not in the scope artifact', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'manifest.json')]: manifestRegisteringScope(scopeJson()),
      [join(PROJECT_ROOT, 'cases', 'login.json')]: testCaseJson({ requirementIds: ['missing'] }),
    });

    const error = await runCasesAdd(context, { path: 'cases/login.json' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('CASE_UNLINKED_REQUIREMENT');
  });

  it('rejects a case when there is no scope artifact at all', async () => {
    const context = fakeContext({
      [join(PROJECT_ROOT, 'cases', 'login.json')]: testCaseJson({ requirementIds: ['r1'] }),
    });

    await expect(runCasesAdd(context, { path: 'cases/login.json' })).rejects.toThrow(QaError);
  });

  it('rejects a hand-edited scope artifact that no longer matches the manifest (P2-07)', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'manifest.json')]: manifestRegisteringScope('{"tampered":true}'),
      [join(PROJECT_ROOT, 'cases', 'login.json')]: testCaseJson({ requirementIds: ['r1'] }),
    });

    const error = await runCasesAdd(context, { path: 'cases/login.json' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('ARTIFACT_HASH_MISMATCH');
  });

  it('rejects a scope artifact that exists on disk but was never registered in the manifest', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(PROJECT_ROOT, 'cases', 'login.json')]: testCaseJson({ requirementIds: ['r1'] }),
    });

    const error = await runCasesAdd(context, { path: 'cases/login.json' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('ARTIFACT_UNREGISTERED');
  });

  it('rejects a case file that fails schema validation', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(PROJECT_ROOT, 'cases', 'login.json')]: JSON.stringify({ id: 'case-1', requirementIds: [] }),
    });

    await expect(runCasesAdd(context, { path: 'cases/login.json' })).rejects.toThrow(QaError);
  });

  describe('inline test case', () => {
    function registeredScopeFiles(): Record<string, string> {
      return {
        [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
        [join(QA_DIR, 'manifest.json')]: manifestRegisteringScope(scopeJson()),
      };
    }

    it('registers a case given inline, without any file in the project', async () => {
      const context = fakeContext(registeredScopeFiles());

      const result = await runCasesAdd(context, {
        testCase: JSON.parse(testCaseJson({ id: 'inline-1', requirementIds: ['r1'] })) as unknown,
      });

      expect(result.casePath).toBe('artifacts/cases/checkout/inline-1.json');
      await expect(
        context.fs.readFile(join(QA_DIR, 'artifacts', 'cases', 'checkout', 'inline-1.json')),
      ).resolves.toContain('"inline-1"');
    });

    it('rejects an inline case that fails schema validation, naming the failing fields', async () => {
      const context = fakeContext(registeredScopeFiles());

      const error = await runCasesAdd(context, { testCase: { id: 'x', requirementIds: [] } }).catch(
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(QaError);
      expect((error as QaError).code).toBe('CASE_INVALID');
      expect((error as QaError).remediation).toContain('feature');
    });

    it('names the case itself when the inline value is not an object', async () => {
      const context = fakeContext(registeredScopeFiles());

      const error = await runCasesAdd(context, { testCase: 'not a case' }).catch((caught: unknown) => caught);

      expect((error as QaError).code).toBe('CASE_INVALID');
      expect((error as QaError).remediation).toContain('(root)');
    });

    it('rejects a call that gives both a path and an inline case', async () => {
      const context = fakeContext(registeredScopeFiles());

      const error = await runCasesAdd(context, {
        path: 'cases/login.json',
        testCase: JSON.parse(testCaseJson({ requirementIds: ['r1'] })) as unknown,
      }).catch((caught: unknown) => caught);

      expect((error as QaError).code).toBe('CASES_ADD_USAGE');
    });
  });

  it('rejects no --path given', async () => {
    const context = fakeContext();

    await expect(runCasesAdd(context, {})).rejects.toThrow(QaError);
  });

  it('rejects a --path that does not exist', async () => {
    const context = fakeContext();

    await expect(runCasesAdd(context, { path: 'cases/missing.json' })).rejects.toThrow(QaError);
  });

  it('rejects a --path outside the project', async () => {
    const context = fakeContext();

    await expect(runCasesAdd(context, { path: '../outside.json' })).rejects.toThrow(QaError);
  });

  it('rejects a case while any testing type is still undecided (P2-16)', async () => {
    const undecidedYaml = CONFIG_YAML.replace('api: out-of-scope', 'api: undecided');
    const context = fakeContext({
      [join(QA_DIR, 'config.yaml')]: undecidedYaml,
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'manifest.json')]: manifestRegisteringScope(scopeJson()),
      [join(PROJECT_ROOT, 'cases', 'login.json')]: testCaseJson({ requirementIds: ['r1'] }),
    });

    const error = await runCasesAdd(context, { path: 'cases/login.json' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('CASES_ADD_TESTING_UNDECIDED');
    expect((error as QaError).message).toContain('api');
  });

  it('rejects a case whose testType is not in scope (P2-16)', async () => {
    const outOfScopeYaml = CONFIG_YAML.replace('e2e: in-scope', 'e2e: out-of-scope');
    const context = fakeContext({
      [join(QA_DIR, 'config.yaml')]: outOfScopeYaml,
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'manifest.json')]: manifestRegisteringScope(scopeJson()),
      [join(PROJECT_ROOT, 'cases', 'login.json')]: testCaseJson({ requirementIds: ['r1'] }),
    });

    const error = await runCasesAdd(context, { path: 'cases/login.json' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('CASE_TYPE_OUT_OF_SCOPE');
  });

  describe('api cases', () => {
    const apiConfigYaml = CONFIG_YAML.replace('api: out-of-scope', 'api: in-scope').replace(
      'environments: {}',
      'api: { contract: openapi, source: discover }\nenvironments: {}',
    );

    function apiContext(caseJson: string): ReturnType<typeof fakeContext> {
      return fakeContext({
        [join(QA_DIR, 'config.yaml')]: apiConfigYaml,
        [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
        [join(QA_DIR, 'manifest.json')]: manifestRegisteringScope(scopeJson()),
        [join(PROJECT_ROOT, 'cases', 'api.json')]: caseJson,
      });
    }

    it('rejects an api case without endpoints, naming the remediation', async () => {
      const context = apiContext(testCaseJson({ requirementIds: ['r1'], testType: 'api' }));

      const error = await runCasesAdd(context, { path: 'cases/api.json' }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(QaError);
      expect((error as QaError).code).toBe('CASE_API_ENDPOINTS_REQUIRED');
      expect((error as QaError).remediation).toContain('endpoints');
    });

    it('registers an api case that lists its endpoints', async () => {
      const context = apiContext(
        testCaseJson({
          requirementIds: ['r1'],
          testType: 'api',
          endpoints: [{ method: 'GET', path: '/api/items' }],
        }),
      );

      const result = await runCasesAdd(context, { path: 'cases/api.json' });

      expect(result.id).toBe('case-1');
    });
  });
});
