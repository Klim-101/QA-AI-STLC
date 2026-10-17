// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import type { DefectDraft } from '@qa-ai-stlc/schemas';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { toCanonicalJson } from '../json-file.js';
import { ManifestStore } from '../manifest-store.js';
import { QaStore } from '../qa-store.js';
import { createFakeEngineContext } from '../test-support/fake-engine-context.js';
import { runDefectAccept, runDefectAdd } from './defect.js';
import { runDefectDraftInput } from './defect-draft-input.js';
import { runTriageAdd } from './triage-add.js';

const CONFIG = [
  'schemaVersion: 1',
  'testing: { e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
  'environments:',
  '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

const SCOPE = toCanonicalJson({
  generatedAt: '2026-10-06T12:00:00Z',
  requirements: [{ id: 'req-login', title: 'Login', source: { kind: 'text', label: 'x' }, inScope: true }],
});

function resultJson(id: string, testCaseId: string, evidenceId: string): string {
  return toCanonicalJson({
    schemaVersion: 1,
    id,
    runId: 'run-1',
    testCaseId,
    testType: 'e2e',
    status: 'failed',
    startedAt: '2026-10-10T10:00:00Z',
    finishedAt: '2026-10-10T10:00:01Z',
    evidenceIds: [evidenceId],
    failure: { message: 'Expected "Welcome, Alex" but received "Welcome, "' },
  });
}

function caseJson(id: string): string {
  return toCanonicalJson({
    id,
    feature: 'auth',
    requirementIds: ['req-login'],
    testType: 'e2e',
    title: `Case ${id}`,
    steps: [{ description: 'Open the login page' }, { description: 'Log in as admin' }],
    expectedResult: 'The dashboard greets the user by name',
    status: 'approved',
    createdAt: '2026-10-01T09:00:00Z',
  });
}

interface ProjectOptions {
  readonly identity?: string;
  readonly withRunRecord?: boolean;
}

async function project(options: ProjectOptions = {}): Promise<EngineContext> {
  const fs = createFakeFileSystem({ [join('project', '.qa', 'config.yaml')]: CONFIG });
  const context = createFakeEngineContext({ fs, clock: { now: () => new Date('2026-10-17T12:00:00Z') } });
  const store = new QaStore({ projectRoot: 'project', fs });
  const manifest = new ManifestStore({ store });
  await store.writeText('artifacts/scope.json', SCOPE);
  await manifest.register('artifacts/scope.json', SCOPE);
  for (const id of ['greeting', 'slow', 'other']) {
    await store.writeText(`artifacts/cases/auth/${id}.json`, caseJson(id));
    await store.writeJson(
      `runs/run-1/results/r-${id}.json`,
      JSON.parse(resultJson(`r-${id}`, id, `ev-${id}`)),
    );
    const evidencePath = `evidence/run-1/ev-${id}.png`;
    await store.writeBytes(evidencePath, new Uint8Array([1, 2, 3]));
    await manifest.register(evidencePath, new Uint8Array([1, 2, 3]));
  }
  if (options.withRunRecord !== false) {
    await store.writeJson('runs/run-1/run.json', {
      schemaVersion: 1,
      id: 'run-1',
      testType: 'e2e',
      specFiles: ['tests/a.spec.ts'],
      baseUrl: 'https://staging.example.test/',
      ...(options.identity === undefined ? {} : { identity: options.identity }),
      startedAt: '2026-10-10T10:00:00Z',
      finishedAt: '2026-10-10T10:00:05Z',
      resultIds: ['r-greeting', 'r-slow', 'r-other'],
      counts: { passed: 0, failed: 3, blocked: 0, skipped: 0, uncertain: 0, partial: 0 },
    });
  }
  return context;
}

async function triage(context: EngineContext): Promise<void> {
  await runTriageAdd(context, {
    triage: {
      schemaVersion: 1,
      runId: 'run-1',
      createdAt: '2026-10-17T09:00:00Z',
      entries: [
        {
          resultId: 'r-greeting',
          testCaseId: 'greeting',
          category: 'product-bug',
          confidence: 'high',
          reasons: ['The greeting has no name.'],
          evidencePaths: ['evidence/run-1/ev-greeting.png'],
        },
        {
          resultId: 'r-slow',
          testCaseId: 'slow',
          category: 'environment',
          confidence: 'medium',
          reasons: ['The page did not answer.'],
          evidencePaths: ['evidence/run-1/ev-slow.png'],
        },
        {
          resultId: 'r-other',
          testCaseId: 'other',
          category: 'uncertain',
          confidence: 'low',
          reasons: ['Nothing places it.'],
          evidencePaths: [],
        },
      ],
    },
  });
}

function draft(overrides: Partial<DefectDraft> = {}): DefectDraft {
  return {
    schemaVersion: 1,
    id: 'greeting-empty',
    title: 'The dashboard greeting has no name',
    severityProposal: 'major',
    category: 'functional',
    steps: ['Open the login page', 'Log in as admin'],
    expectedResult: 'The dashboard greets the user by name',
    actualResult: 'The greeting is "Welcome, "',
    environment: 'https://staging.example.test/',
    requirementIds: ['req-login'],
    evidencePaths: ['evidence/run-1/ev-greeting.png'],
    source: { runId: 'run-1', resultId: 'r-greeting' },
    status: 'draft',
    createdAt: '2026-10-17T10:00:00Z',
    ...overrides,
  };
}

describe('runDefectDraftInput', () => {
  it('seeds a draft for each failure the triage called a product bug, and for no other', async () => {
    const context = await project();
    await triage(context);

    const input = await runDefectDraftInput(context, { runId: 'run-1' });

    expect(input.runId).toBe('run-1');
    expect(input.seeds).toHaveLength(1);
    expect(input.seeds[0]).toMatchObject({
      resultId: 'r-greeting',
      testCaseId: 'greeting',
      caseTitle: 'Case greeting',
      steps: ['Open the login page', 'Log in as admin'],
      expectedResult: 'The dashboard greets the user by name',
      requirementIds: ['req-login'],
      environment: 'https://staging.example.test/',
      evidencePaths: ['evidence/run-1/ev-greeting.png'],
      triageConfidence: 'high',
      triageReasons: ['The greeting has no name.'],
    });
    expect(input.seeds[0]?.actualResult).toContain('UNTRUSTED EVIDENCE BEGIN');
    expect(input.seeds[0]?.actualResult).toContain('Welcome, Alex');
  });

  it('names the identity the run signed in as, and leaves the environment out when there is no run record', async () => {
    const signedIn = await project({ identity: 'admin' });
    await triage(signedIn);
    const interactive = await project({ withRunRecord: false });
    await triage(interactive);

    expect((await runDefectDraftInput(signedIn, { runId: 'run-1' })).seeds[0]?.environment).toBe(
      'https://staging.example.test/ (signed in as admin)',
    );
    expect(await runDefectDraftInput(interactive, { runId: 'run-1' })).toMatchObject({
      seeds: [expect.not.objectContaining({ environment: expect.anything() as string })],
    });
  });

  it('lists nothing for a run with no product bug', async () => {
    const context = await project();
    await runTriageAdd(context, {
      triage: {
        schemaVersion: 1,
        runId: 'run-1',
        createdAt: '2026-10-17T09:00:00Z',
        entries: ['greeting', 'slow', 'other'].map((id) => ({
          resultId: `r-${id}`,
          testCaseId: id,
          category: 'uncertain',
          confidence: 'low',
          reasons: ['x'],
          evidencePaths: [],
        })),
      },
    });

    expect((await runDefectDraftInput(context, { runId: 'run-1' })).seeds).toEqual([]);
  });

  it('refuses a run with no triage, a run id that is not a name, and a failure that is no longer recorded', async () => {
    const context = await project();
    await expect(runDefectDraftInput(context, { runId: 'run-1' })).rejects.toMatchObject({
      code: 'TRIAGE_NOT_REGISTERED',
    });
    await expect(runDefectDraftInput(context, {})).rejects.toMatchObject({
      code: 'DEFECT_DRAFT_INPUT_USAGE',
    });
    await expect(runDefectDraftInput(context, { runId: '../x' })).rejects.toMatchObject({
      code: 'DEFECT_DRAFT_INPUT_USAGE',
    });
    await triage(context);
    await context.fs.deleteFile(join('project', '.qa', 'runs', 'run-1', 'results', 'r-greeting.json'));
    await expect(runDefectDraftInput(context, { runId: 'run-1' })).rejects.toMatchObject({
      code: 'DEFECT_DRAFT_RESULT_MISSING',
    });
  });
});

describe('a defect drafted from a failure', () => {
  it('is registered, and accepted by the operator, with the evidence of that failure', async () => {
    const context = await project();
    await triage(context);

    const added = await runDefectAdd(context, { draft: draft() });
    const accepted = await runDefectAccept(context, { id: 'greeting-empty', approvedBy: 'operator' });

    expect(added).toMatchObject({ id: 'greeting-empty', evidencePaths: ['evidence/run-1/ev-greeting.png'] });
    expect(accepted).toMatchObject({ id: 'greeting-empty', status: 'accepted' });
  });

  it('is refused for a failure the triage called anything but a product bug', async () => {
    const context = await project();
    await triage(context);

    await expect(
      runDefectAdd(context, {
        draft: draft({
          id: 'slow-page',
          source: { runId: 'run-1', resultId: 'r-slow' },
          evidencePaths: ['evidence/run-1/ev-slow.png'],
        }),
      }),
    ).rejects.toMatchObject({ code: 'DEFECT_SOURCE_NOT_TRIAGED' });
  });

  it('is refused for a run with no triage and for a result the run does not have', async () => {
    const untriaged = await project();
    const triaged = await project();
    await triage(triaged);

    await expect(runDefectAdd(untriaged, { draft: draft() })).rejects.toMatchObject({
      code: 'DEFECT_SOURCE_NOT_TRIAGED',
    });
    await expect(
      runDefectAdd(triaged, { draft: draft({ source: { runId: 'run-1', resultId: 'r-invented' } }) }),
    ).rejects.toMatchObject({ code: 'DEFECT_SOURCE_NOT_TRIAGED' });
  });

  it('is refused with no evidence, and with evidence of another failure even though the engine registered it', async () => {
    const context = await project();
    await triage(context);

    await expect(runDefectAdd(context, { draft: draft({ evidencePaths: [] }) })).rejects.toMatchObject({
      code: 'DEFECT_EVIDENCE_MISSING',
    });
    await expect(
      runDefectAdd(context, { draft: draft({ evidencePaths: ['evidence/run-1/ev-slow.png'] }) }),
    ).rejects.toMatchObject({ code: 'DEFECT_EVIDENCE_NOT_OF_RESULT' });
  });

  it('is not held to a triage when it names no source, as a defect found some other way', async () => {
    const context = await project();
    const withoutSource = { ...draft({ evidencePaths: [] }), source: undefined };

    expect((await runDefectAdd(context, { draft: withoutSource })).id).toBe('greeting-empty');
  });
});
