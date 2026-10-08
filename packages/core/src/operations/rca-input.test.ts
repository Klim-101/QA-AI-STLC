// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { RcaInputSchema, type DefectDraft } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { hashBytes, hashText } from '../hash.js';
import { noopLogger } from '../ports/logger.js';
import {
  UNTRUSTED_EVIDENCE_BEGIN_MARKER,
  UNTRUSTED_EVIDENCE_END_MARKER,
} from '../untrusted-evidence-text.js';
import { runDefectAccept, runDefectAdd } from './defect.js';
import { runRcaInput } from './rca-input.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

const SCOPE_JSON = JSON.stringify({
  generatedAt: '2026-10-07T12:00:00Z',
  requirements: [
    { id: 'login', title: 'Login', source: { kind: 'text', label: 'x' }, inScope: true },
    { id: 'other', title: 'Other', source: { kind: 'text', label: 'x' }, inScope: true },
  ],
});
const CONSOLE_LOG = 'GET /login 401\nUncaught TypeError: handler is undefined';
const SCREENSHOT = Buffer.from('not-really-a-png');

function caseJson(id: string, requirementIds: string[]): string {
  return JSON.stringify({
    schemaVersion: 1,
    id,
    feature: 'auth',
    requirementIds,
    testType: 'e2e',
    title: `Case ${id}`,
    steps: [{ description: 'Do it' }],
    expectedResult: 'It works',
    status: 'approved',
    createdAt: '2026-10-07T12:00:00Z',
  });
}

function resultJson(
  id: string,
  testCaseId: string,
  runId: string,
  finishedAt: string,
  failure?: string,
): string {
  return JSON.stringify({
    schemaVersion: 1,
    id,
    runId,
    testCaseId,
    testType: 'e2e',
    status: failure === undefined ? 'passed' : 'failed',
    startedAt: '2026-10-01T10:00:00.000Z',
    finishedAt,
    evidenceIds: [],
    ...(failure === undefined ? {} : { failure: { message: failure } }),
  });
}

function manifestJson(entries: Record<string, { sha256: string; mode: 'text' | 'bytes' }>): string {
  return JSON.stringify({
    schemaVersion: 1,
    artifacts: Object.fromEntries(
      Object.entries(entries).map(([path, entry]) => [
        path,
        { ...entry, registeredAt: '2026-10-07T12:00:00Z' },
      ]),
    ),
  });
}

const DEFECT: DefectDraft = {
  schemaVersion: 1,
  id: 'login-error',
  title: 'Invalid credentials show no error',
  severityProposal: 'major',
  category: 'functional',
  steps: ['Open the login page'],
  expectedResult: 'An error is shown',
  actualResult: 'Nothing is shown',
  environment: 'staging',
  requirementIds: ['login'],
  evidencePaths: ['evidence/run-1/console-1.log', 'evidence/run-1/screenshot-1.png'],
  status: 'draft',
  createdAt: '2026-10-07T12:00:00Z',
};

interface ContextOptions {
  readonly defect?: DefectDraft;
  readonly config?: string;
  readonly files?: Record<string, string>;
  readonly manifest?: Record<string, { sha256: string; mode: 'text' | 'bytes' }>;
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

async function acceptedContext(options: ContextOptions = {}): Promise<EngineContext> {
  const context: EngineContext = {
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem({
      [join(QA_DIR, 'config.yaml')]: options.config ?? CONFIG_YAML,
      [join(QA_DIR, 'artifacts', 'scope.json')]: SCOPE_JSON,
      [join(QA_DIR, 'manifest.json')]: manifestJson({
        'artifacts/scope.json': { sha256: hashText(SCOPE_JSON), mode: 'text' },
        'evidence/run-1/console-1.log': { sha256: hashBytes(Buffer.from(CONSOLE_LOG)), mode: 'bytes' },
        'evidence/run-1/screenshot-1.png': { sha256: hashBytes(SCREENSHOT), mode: 'bytes' },
        ...options.manifest,
      }),
      [join(QA_DIR, 'evidence', 'run-1', 'console-1.log')]: CONSOLE_LOG,
      [join(QA_DIR, 'artifacts', 'cases', 'auth', 'login-case.json')]: caseJson('login-case', ['login']),
      [join(QA_DIR, 'artifacts', 'cases', 'auth', 'other-case.json')]: caseJson('other-case', ['other']),
      [join(PROJECT_ROOT, 'defect.json')]: JSON.stringify(options.defect ?? DEFECT),
      ...options.files,
    }),
    clock: { now: () => new Date('2026-10-07T12:30:00Z') },
    logger: noopLogger,
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeBrowserLauncher(),
    env: {},
  };
  await context.fs.writeFile(join(QA_DIR, 'evidence', 'run-1', 'screenshot-1.png'), SCREENSHOT.toString());
  return context;
}

async function withAcceptedDefect(options: ContextOptions = {}): Promise<EngineContext> {
  const context = await acceptedContext(options);
  await runDefectAdd(context, { path: 'defect.json' });
  await runDefectAccept(context, { id: 'login-error', approvedBy: 'operator' });
  return context;
}

describe('runRcaInput', () => {
  it('hands over the accepted defect, the cases covering its requirements, their history and its evidence', async () => {
    const context = await withAcceptedDefect({
      files: {
        [join(QA_DIR, 'artifacts', 'cases', 'auth', 'a-case.json')]: caseJson('a-case', ['login']),
        [join(QA_DIR, 'runs', 'run-1', 'results', 'r1.json')]: resultJson(
          'r1',
          'login-case',
          'run-1',
          '2026-10-02T10:00:00.000Z',
          'expected error text',
        ),
        [join(QA_DIR, 'runs', 'run-2', 'results', 'r2.json')]: resultJson(
          'r2',
          'login-case',
          'run-2',
          '2026-10-03T10:00:00.000Z',
        ),
        [join(QA_DIR, 'runs', 'run-3', 'results', 'r3.json')]: resultJson(
          'r3',
          'other-case',
          'run-3',
          '2026-10-04T10:00:00.000Z',
        ),
      },
    });

    const input = RcaInputSchema.parse(await runRcaInput(context, { defectId: 'login-error' }));

    expect(input.defect.id).toBe('login-error');
    expect(input.defect.status).toBe('accepted');
    expect(input.defectSha256).toBe(
      hashText(await context.fs.readFile(join(QA_DIR, 'artifacts', 'defects', 'login-error.json'))),
    );
    expect(input.cases.map((testCase) => testCase.id)).toEqual(['a-case', 'login-case']);
    expect(input.results.map((result) => result.resultId)).toEqual(['r2', 'r1']);
    expect(input.omittedResultCount).toBe(0);
    expect(input.source).toEqual({ isConfigured: false });
  });

  it('wraps the failure message and a text excerpt in untrusted markers and only references binary evidence', async () => {
    const context = await withAcceptedDefect({
      files: {
        [join(QA_DIR, 'runs', 'run-1', 'results', 'r1.json')]: resultJson(
          'r1',
          'login-case',
          'run-1',
          '2026-10-02T10:00:00.000Z',
          'Timeout waiting for the error banner',
        ),
      },
    });

    const input = await runRcaInput(context, { defectId: 'login-error' });

    expect(input.results[0]?.failureMessage).toBe(
      [
        UNTRUSTED_EVIDENCE_BEGIN_MARKER,
        'Timeout waiting for the error banner',
        UNTRUSTED_EVIDENCE_END_MARKER,
      ].join('\n'),
    );
    const [log, screenshot] = input.evidence;
    expect(log).toMatchObject({
      path: 'evidence/run-1/console-1.log',
      sha256: hashBytes(Buffer.from(CONSOLE_LOG)),
      sizeBytes: CONSOLE_LOG.length,
      isTruncated: false,
    });
    expect(log?.excerpt).toContain('Uncaught TypeError: handler is undefined');
    expect(log?.excerpt?.startsWith(UNTRUSTED_EVIDENCE_BEGIN_MARKER)).toBe(true);
    expect(screenshot).toMatchObject({ path: 'evidence/run-1/screenshot-1.png' });
    expect(screenshot).not.toHaveProperty('excerpt');
  });

  it('includes results of a run the evidence came from even when no case covers the defect', async () => {
    const context = await withAcceptedDefect({
      defect: { ...DEFECT, requirementIds: [] },
      files: {
        [join(QA_DIR, 'runs', 'run-1', 'results', 'r1.json')]: resultJson(
          'r1',
          'other-case',
          'run-1',
          '2026-10-02T10:00:00.000Z',
        ),
      },
    });

    const input = await runRcaInput(context, { defectId: 'login-error' });

    expect(input.cases).toEqual([]);
    expect(input.results.map((result) => result.resultId)).toEqual(['r1']);
  });

  it('reads the run of an evidence path with no run folder as no run at all', async () => {
    const context = await withAcceptedDefect({
      defect: { ...DEFECT, evidencePaths: ['loose.json'] },
      manifest: { 'loose.json': { sha256: hashBytes(Buffer.from('{}')), mode: 'bytes' } },
      files: { [join(QA_DIR, 'loose.json')]: '{}' },
    });

    const input = await runRcaInput(context, { defectId: 'login-error' });

    expect(input.evidence).toHaveLength(1);
    expect(input.results).toEqual([]);
  });

  it('keeps the newest twenty results and says how many it left out', async () => {
    const files: Record<string, string> = {};
    for (let index = 1; index <= 22; index += 1) {
      const id = `r${String(index)}`;
      const day = String(index).padStart(2, '0');
      files[join(QA_DIR, 'runs', `run-${id}`, 'results', `${id}.json`)] = resultJson(
        id,
        'login-case',
        `run-${id}`,
        `2026-10-${day}T10:00:00.000Z`,
      );
    }
    const context = await withAcceptedDefect({ files });

    const input = await runRcaInput(context, { defectId: 'login-error' });

    expect(input.results).toHaveLength(20);
    expect(input.results[0]?.resultId).toBe('r22');
    expect(input.omittedResultCount).toBe(2);
  });

  it('truncates a long text excerpt and flags it', async () => {
    const longLog = 'a'.repeat(5_000);
    const context = await withAcceptedDefect({
      manifest: {
        'evidence/run-1/console-1.log': { sha256: hashBytes(Buffer.from(longLog)), mode: 'bytes' },
      },
      files: { [join(QA_DIR, 'evidence', 'run-1', 'console-1.log')]: longLog },
    });

    const input = await runRcaInput(context, { defectId: 'login-error' });

    expect(input.evidence[0]).toMatchObject({ isTruncated: true, sizeBytes: 5_000 });
  });

  it('reports the configured source directory', async () => {
    const context = await withAcceptedDefect({ config: `${CONFIG_YAML}source: { path: app/src }\n` });

    const input = await runRcaInput(context, { defectId: 'login-error' });

    expect(input.source).toEqual({ isConfigured: true, path: 'app/src' });
  });

  it('refuses evidence changed since it was registered', async () => {
    const context = await withAcceptedDefect();
    await context.fs.writeFile(join(QA_DIR, 'evidence', 'run-1', 'console-1.log'), 'tampered');

    await expect(runRcaInput(context, { defectId: 'login-error' })).rejects.toMatchObject({
      code: 'ARTIFACT_HASH_MISMATCH',
    });
  });

  it('requires a defect id', async () => {
    await expect(runRcaInput(await acceptedContext(), {})).rejects.toMatchObject({ code: 'RCA_INPUT_USAGE' });
  });

  it('fails with a coded error for a defect that is registered but not accepted', async () => {
    const context = await acceptedContext();
    await runDefectAdd(context, { path: 'defect.json' });

    await expect(runRcaInput(context, { defectId: 'login-error' })).rejects.toMatchObject({
      code: 'RCA_DEFECT_NOT_ACCEPTED',
    });
  });
});
