// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { hashText } from '../hash.js';
import { systemClock } from '../ports/clock.js';
import { noopLogger } from '../ports/logger.js';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { runApprove } from './approve.js';
import { runCasesAdd } from './cases-add.js';
import { runStatus } from './status.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

/** A config whose in-scope types are exactly `types`, so the `cases` gate needs a case for each. */
function configYaml(types: readonly string[]): string {
  const decision = (type: string): string => (types.includes(type) ? 'in-scope' : 'out-of-scope');
  return [
    'schemaVersion: 1',
    `testing: { e2e: ${decision('e2e')}, api: ${decision('api')}, a11y: ${decision('a11y')}, security: out-of-scope }`,
    'api: { contract: openapi, source: discover }',
    'environments: {}',
    'identities: {}',
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
    'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
    '',
  ].join('\n');
}

const SCOPE_JSON = JSON.stringify({
  generatedAt: '2026-09-20T12:00:00Z',
  requirements: [{ id: 'r1', title: 'R1', source: { kind: 'text', label: 'x' }, inScope: true }],
});

function fakeContext(
  files: Readonly<Record<string, string>> = {},
  types: readonly string[] = ['e2e'],
): EngineContext {
  return {
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem({
      [join(QA_DIR, 'config.yaml')]: configYaml(types),
      ...files,
    }),
    clock: systemClock,
    logger: noopLogger,
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeBrowserLauncher(),
    env: {},
  };
}

function testCase(id: string, testType: 'e2e' | 'api'): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id,
    feature: 'checkout',
    requirementIds: ['r1'],
    testType,
    title: `Case ${id}`,
    steps: [{ description: 'Do something' }],
    expectedResult: 'Something happens',
    status: 'draft',
    createdAt: '2026-09-20T12:00:00Z',
    ...(testType === 'api' ? { endpoints: [{ method: 'GET', path: '/x' }] } : {}),
  };
}

/** A project with `scope` approved, every given case registered and the `cases` gate approved. */
async function approvedProject(
  cases: readonly Record<string, unknown>[],
  extraFiles: Readonly<Record<string, string>> = {},
): Promise<EngineContext> {
  const context = fakeContext(
    {
      [join(QA_DIR, 'artifacts', 'scope.json')]: SCOPE_JSON,
      [join(QA_DIR, 'manifest.json')]: JSON.stringify({
        schemaVersion: 1,
        artifacts: {
          'artifacts/scope.json': {
            sha256: hashText(SCOPE_JSON),
            mode: 'text',
            registeredAt: '2026-09-20T12:00:00Z',
          },
        },
      }),
      ...extraFiles,
    },
    cases.map((testCase) => String(testCase.testType)),
  );
  await runApprove(context, { gate: 'scope', artifactPath: 'artifacts/scope.json', approvedBy: 'operator' });
  for (const testCase of cases) {
    await runCasesAdd(context, { testCase });
  }
  await runApprove(context, {
    gate: 'cases',
    artifactPath: 'artifacts/cases-index.json',
    approvedBy: 'operator',
  });
  return context;
}

function runResultJson(id: string, testCaseId: string, status: string): string {
  return JSON.stringify({
    schemaVersion: 1,
    id,
    runId: `run-${id}`,
    testCaseId,
    testType: 'e2e',
    status,
    startedAt: '2026-09-20T12:00:00Z',
    finishedAt: '2026-09-20T12:01:00Z',
    evidenceIds: [],
  });
}

describe('runStatus', () => {
  it('points at the scope phase on a fresh project', async () => {
    const report = await runStatus(fakeContext());

    expect(report.state.gates.scope.status).toBe('open');
    expect(report.nextActions).toEqual([
      expect.objectContaining({ kind: 'phase', skill: 'qa-start', tool: 'qa.scope' }),
    ]);
  });

  it('points at the cases phase once scope is approved', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: SCOPE_JSON,
      [join(QA_DIR, 'manifest.json')]: JSON.stringify({
        schemaVersion: 1,
        artifacts: {
          'artifacts/scope.json': {
            sha256: hashText(SCOPE_JSON),
            mode: 'text',
            registeredAt: '2026-09-20T12:00:00Z',
          },
        },
      }),
    });
    await runApprove(context, {
      gate: 'scope',
      artifactPath: 'artifacts/scope.json',
      approvedBy: 'operator',
    });

    const report = await runStatus(context);

    expect(report.nextActions).toEqual([
      expect.objectContaining({ kind: 'phase', skill: 'qa-design-cases', tool: 'qa.cases_add' }),
    ]);
  });

  it('suggests exploring, then executing, once every gate is approved (#634)', async () => {
    const context = await approvedProject([testCase('case-a', 'e2e'), testCase('case-b', 'api')]);

    const report = await runStatus(context);

    expect(report.nextActions.map((action) => action.kind)).toEqual(['explore', 'execute']);
    expect(report.nextActions[0]).toMatchObject({ skill: 'qa-explore', tool: 'qa.explore' });
    expect(report.nextActions[1]).toMatchObject({
      skill: 'qa-execute',
      cases: { ids: ['case-a', 'case-b'], total: 2 },
    });
  });

  it('does not ask for exploration when only api cases exist or a registry is there', async () => {
    const apiOnly = await runStatus(await approvedProject([testCase('case-b', 'api')]));
    const explored = await runStatus(
      await approvedProject([testCase('case-a', 'e2e')], {
        [join(QA_DIR, 'selectors', 'registry.json')]: '{}',
      }),
    );

    expect(apiOnly.nextActions.map((action) => action.kind)).toEqual(['execute']);
    expect(explored.nextActions.map((action) => action.kind)).toEqual(['execute']);
  });

  it('lists only the cases without a passing result, capped at ten ids with the full count', async () => {
    const cases = Array.from({ length: 12 }, (_, index) => testCase(`case-${String(index + 10)}`, 'api'));
    const context = await approvedProject(cases, {
      [join(QA_DIR, 'runs', 'case-10', 'r1.json')]: runResultJson('r1', 'case-10', 'passed'),
      [join(QA_DIR, 'runs', 'case-11', 'r2.json')]: runResultJson('r2', 'case-11', 'skipped'),
    });

    const [execute] = (await runStatus(context)).nextActions.filter((action) => action.kind === 'execute');

    expect(execute?.cases?.total).toBe(11);
    expect(execute?.cases?.ids).toHaveLength(10);
    expect(execute?.cases?.ids).not.toContain('case-10');
    expect(execute?.cases?.ids).toContain('case-11');
  });

  it('suggests generation for passing web and api cases that no registered spec covers', async () => {
    const context = await approvedProject([testCase('case-a', 'e2e'), testCase('case-b', 'api')], {
      [join(QA_DIR, 'selectors', 'registry.json')]: '{}',
      [join(QA_DIR, 'runs', 'case-a', 'r1.json')]: runResultJson('r1', 'case-a', 'passed'),
      [join(QA_DIR, 'runs', 'case-b', 'r2.json')]: runResultJson('r2', 'case-b', 'passed'),
    });

    const report = await runStatus(context);

    expect(report.nextActions).toEqual([
      expect.objectContaining({
        kind: 'generate',
        skill: 'qa-generate-tests',
        cases: { ids: ['case-a', 'case-b'], total: 2 },
      }),
    ]);
  });

  it('counts a case as generated once a registered spec names it, and skips a missing spec file', async () => {
    const spec =
      "test('x', { annotation: { type: 'testCaseId', description: 'case-a' } }, async () => undefined);";
    const context = await approvedProject([testCase('case-a', 'e2e')], {
      [join(QA_DIR, 'selectors', 'registry.json')]: '{}',
      [join(QA_DIR, 'runs', 'case-a', 'r1.json')]: runResultJson('r1', 'case-a', 'passed'),
      [join(PROJECT_ROOT, 'tests', 'qa', 'a.spec.ts')]: spec,
    });
    const manifestPath = join(QA_DIR, 'manifest.json');
    const manifest = JSON.parse(await context.fs.readFile(manifestPath)) as {
      artifacts: Record<string, unknown>;
    };
    const entry = { sha256: hashText(spec), mode: 'text', registeredAt: '2026-09-20T12:00:00Z' };
    manifest.artifacts['tests/qa/a.spec.ts'] = entry;
    manifest.artifacts['tests/qa/gone.spec.ts'] = entry;
    await context.fs.writeFile(manifestPath, JSON.stringify(manifest));

    const report = await runStatus(context);

    expect(report.nextActions).toEqual([]);
  });

  it('does not suggest generation for an accessibility case', async () => {
    const context = await approvedProject([{ ...testCase('case-a', 'api'), testType: 'a11y' }], {
      [join(QA_DIR, 'runs', 'case-a', 'r1.json')]: runResultJson('r1', 'case-a', 'passed'),
    });

    expect((await runStatus(context)).nextActions).toEqual([]);
  });
});
