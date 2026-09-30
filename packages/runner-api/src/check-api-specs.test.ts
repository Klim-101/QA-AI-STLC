// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { hashText, type ApiContract, type EngineContext } from '@qa-ai-stlc/core';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { describe, expect, it } from 'vitest';
import { assertApiSpecsInContract } from './check-api-specs.js';

const NO_NAMES = { headers: [], queryParameters: [] };
const SPEC_PATH = join('project', 'tests', 'api.spec.ts');

const document = {
  openapi: '3.0.3',
  paths: { '/tasks/{taskId}': { get: {} }, '/oauth/token': { post: {} } },
};
const contract: ApiContract = {
  source: 'openapi.json',
  text: JSON.stringify(document),
  sha256: hashText(JSON.stringify(document)),
  document,
};

function annotated(...ids: string[]): string {
  return ids
    .map((id) => `test('t', { annotation: { type: 'testCaseId', description: '${id}' } }, async () => {});`)
    .join('\n');
}

function caseFile(id: string, overrides: Record<string, unknown> = {}): [string, string] {
  return [
    join('project', '.qa', 'artifacts', 'cases', 'tasks', `${id}.json`),
    JSON.stringify({
      schemaVersion: 1,
      id,
      feature: 'tasks',
      requirementIds: ['req-1'],
      testType: 'api',
      title: id,
      steps: [{ description: 'call it' }],
      expectedResult: 'ok',
      endpoints: [{ method: 'GET', path: '/tasks/{id}' }],
      status: 'approved',
      createdAt: '2026-09-30T12:00:00Z',
      ...overrides,
    }),
  ];
}

function engineWith(files: Record<string, string>): EngineContext {
  return {
    projectRoot: 'project',
    fs: createFakeFileSystem(files),
    clock: { now: () => new Date('2026-09-30T12:00:00Z') },
    logger: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeBrowserLauncher(),
    env: {},
  };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
}

describe('assertApiSpecsInContract', () => {
  it('accepts a case whose endpoints are in the contract, ignoring parameter names', async () => {
    const [casePath, caseJson] = caseFile('case-ok');
    const engine = engineWith({ [SPEC_PATH]: annotated('case-ok'), [casePath]: caseJson });

    await expect(assertApiSpecsInContract(engine, [SPEC_PATH], contract, NO_NAMES)).resolves.toBeUndefined();
  });

  it('rejects a case for an endpoint the contract lacks, naming it and the contract source', async () => {
    const [casePath, caseJson] = caseFile('case-missing', {
      endpoints: [
        { method: 'GET', path: '/tasks/{id}' },
        { method: 'DELETE', path: '/tasks/{id}' },
      ],
    });
    const engine = engineWith({ [SPEC_PATH]: annotated('case-missing'), [casePath]: caseJson });

    const error = await rejection(assertApiSpecsInContract(engine, [SPEC_PATH], contract, NO_NAMES));

    expect(error).toMatchObject({
      code: 'API_CASE_NOT_IN_CONTRACT',
      message: expect.stringContaining('DELETE /tasks/{id}') as string,
    });
    expect((error as Error).message).toContain('openapi.json');
  });

  it.each([
    ['a spec with no testCaseId annotation', () => ({ [SPEC_PATH]: "test('t', async () => {});" })],
    [
      'a case that is not an api case',
      () => {
        const [path, json] = caseFile('case-e2e', { testType: 'e2e' });
        return { [SPEC_PATH]: annotated('case-e2e'), [path]: json };
      },
    ],
    [
      'an api case with no endpoints',
      () => {
        const [path, json] = caseFile('case-bare', { endpoints: undefined });
        return { [SPEC_PATH]: annotated('case-bare'), [path]: json };
      },
    ],
  ])('rejects %s as invalid', async (_label, files) => {
    const error = await rejection(
      assertApiSpecsInContract(engineWith(files()), [SPEC_PATH], contract, NO_NAMES),
    );

    expect(error).toMatchObject({ code: 'API_CASE_INVALID' });
  });

  it('rejects a spec stamped with a contract hash the live contract no longer has', async () => {
    const [casePath, caseJson] = caseFile('case-stale');
    const stamped = `export const CONTRACT_SHA256 = "${'0'.repeat(64)}";\n${annotated('case-stale')}`;
    const engine = engineWith({ [SPEC_PATH]: stamped, [casePath]: caseJson });

    const error = await rejection(assertApiSpecsInContract(engine, [SPEC_PATH], contract, NO_NAMES));

    expect(error).toMatchObject({ code: 'API_SPEC_CONTRACT_CHANGED' });
    expect((error as Error).message).toContain(contract.sha256);
  });

  it('accepts a spec stamped with the live contract hash', async () => {
    const [casePath, caseJson] = caseFile('case-fresh');
    const stamped = `export const CONTRACT_SHA256 = "${contract.sha256}";\n${annotated('case-fresh')}`;
    const engine = engineWith({ [SPEC_PATH]: stamped, [casePath]: caseJson });

    await expect(assertApiSpecsInContract(engine, [SPEC_PATH], contract, NO_NAMES)).resolves.toBeUndefined();
  });

  it('reports the contract violation code when a set has both kinds of problem', async () => {
    const [okPath, okJson] = caseFile('case-bare', { endpoints: undefined });
    const [badPath, badJson] = caseFile('case-absent', { endpoints: [{ method: 'PUT', path: '/nope' }] });
    const engine = engineWith({
      [SPEC_PATH]: annotated('case-bare', 'case-absent'),
      [okPath]: okJson,
      [badPath]: badJson,
    });

    const error = await rejection(assertApiSpecsInContract(engine, [SPEC_PATH], contract, NO_NAMES));

    expect(error).toMatchObject({ code: 'API_CASE_NOT_IN_CONTRACT' });
    expect((error as Error).message.split('\n')).toHaveLength(2);
  });

  it('propagates CASE_NOT_FOUND when a spec names an unregistered case', async () => {
    const engine = engineWith({ [SPEC_PATH]: annotated('case-ghost') });

    expect(await rejection(assertApiSpecsInContract(engine, [SPEC_PATH], contract, NO_NAMES))).toMatchObject({
      code: 'CASE_NOT_FOUND',
    });
  });

  it('rejects a spec that carries a credential of its own, naming the file', async () => {
    const [casePath, caseJson] = caseFile('case-ok');
    const engine = engineWith({
      [SPEC_PATH]: `${annotated('case-ok')}\nconst options = { headers: { 'X-Api-Key': 'k' } };`,
      [casePath]: caseJson,
    });

    const error = await rejection(
      assertApiSpecsInContract(engine, [SPEC_PATH], contract, {
        headers: ['X-Api-Key'],
        queryParameters: [],
      }),
    );

    expect(error).toMatchObject({ code: 'HTTP_CREDENTIAL_INPUT_REJECTED' });
    expect((error as Error).message).toContain(SPEC_PATH);
  });
});
