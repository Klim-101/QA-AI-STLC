// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import type { DefectDraft, Rca } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { noopLogger } from '../ports/logger.js';
import { QaStore } from '../qa-store.js';
import { runDefectAccept, runDefectAdd } from './defect.js';
import { runRcaAdd, runRcaApprove } from './rca.js';
import { runReport } from './report.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');
const NOW = new Date('2026-10-16T12:00:00.000Z');

const CONFIG_YAML = [
  'testing: { e2e: in-scope, api: undecided, a11y: in-scope, security: undecided }',
  'environments: {}',
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
].join('\n');

function defect(id: string): DefectDraft {
  return {
    schemaVersion: 1,
    id,
    title: `Defect ${id}`,
    severityProposal: 'major',
    category: 'functional',
    steps: ['Open the page'],
    expectedResult: 'It works',
    actualResult: 'It does not',
    environment: 'staging',
    requirementIds: [],
    evidencePaths: [],
    status: 'draft',
    createdAt: '2026-10-07T12:00:00Z',
  };
}

function rca(defectId: string): Rca {
  return {
    schemaVersion: 1,
    defectId,
    facts: [`Fact about ${defectId}`],
    evidencePaths: [],
    hypotheses: [{ description: 'The handler is not wired', confidence: 'medium' }],
    remediation: ['Wire it'],
    status: 'draft',
    createdAt: '2026-10-07T12:00:00Z',
  };
}

const RESULT_JSON = JSON.stringify({
  schemaVersion: 1,
  id: 'result-1',
  runId: 'run-live-1',
  testCaseId: 'case-a',
  testType: 'e2e',
  status: 'failed',
  startedAt: '2026-10-16T09:00:00.000Z',
  finishedAt: '2026-10-16T09:01:00.000Z',
  evidenceIds: ['evidence-1'],
  failure: { message: 'The list request returned HTTP 500' },
});

const RUN_JSON = JSON.stringify({
  schemaVersion: 1,
  id: 'run-1',
  testType: 'e2e',
  specFiles: ['tests/login.playwright-spec.ts'],
  baseUrl: 'https://staging.example.test/',
  startedAt: '2026-10-16T10:00:00.000Z',
  finishedAt: '2026-10-16T10:00:05.000Z',
  resultIds: ['result-spec-1'],
  counts: { passed: 1, failed: 0, blocked: 0, skipped: 0, uncertain: 0, partial: 0 },
});

const SCAN_JSON = JSON.stringify({
  type: 'a11y-scan',
  axeVersion: '4.13.0',
  configHash: 'a'.repeat(64),
  wcagVersion: '2.1',
  level: 'AA',
  bestPractices: false,
  tags: [],
  include: [],
  exclude: [],
  violations: [],
  excepted: [],
  expiredExceptions: [],
  uncertain: [],
  passedRuleIds: ['html-has-lang'],
  inapplicableRuleIds: [],
});

function fakeContext(files: Readonly<Record<string, string>>): EngineContext {
  return {
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem(files),
    clock: { now: () => NOW },
    logger: noopLogger,
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeBrowserLauncher(),
    env: {},
  };
}

function storeOf(context: EngineContext): QaStore {
  return new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
}

const BASE_FILES = {
  [join(QA_DIR, 'config.yaml')]: CONFIG_YAML,
  [join(QA_DIR, 'runs', 'case-a', 'result-1.json')]: RESULT_JSON,
};

async function fullContext(): Promise<EngineContext> {
  const context = fakeContext({
    ...BASE_FILES,
    [join(QA_DIR, 'runs', 'run-1', 'run.json')]: RUN_JSON,
    [join(QA_DIR, 'runs', 'run-0', 'run.json')]: RUN_JSON.replace('"id":"run-1"', '"id":"run-0"'),
    [join(QA_DIR, 'evidence', 'run-live-1', 'evidence-1.json')]: SCAN_JSON,
    [join(PROJECT_ROOT, 'defect-a.json')]: JSON.stringify(defect('alpha')),
    [join(PROJECT_ROOT, 'defect-b.json')]: JSON.stringify(defect('beta')),
    [join(PROJECT_ROOT, 'defect-c.json')]: JSON.stringify(defect('gamma')),
    [join(PROJECT_ROOT, 'rca-a.json')]: JSON.stringify(rca('alpha')),
    [join(PROJECT_ROOT, 'rca-b.json')]: JSON.stringify(rca('beta')),
    [join(PROJECT_ROOT, 'defect-d.json')]: JSON.stringify(defect('delta')),
    [join(PROJECT_ROOT, 'rca-d.json')]: JSON.stringify(rca('delta')),
  });
  for (const file of ['defect-a.json', 'defect-b.json', 'defect-c.json', 'defect-d.json']) {
    await runDefectAdd(context, { path: file });
  }
  await runDefectAccept(context, { id: 'alpha', approvedBy: 'operator' });
  await runDefectAccept(context, { id: 'beta', approvedBy: 'operator' });
  await runDefectAccept(context, { id: 'delta', approvedBy: 'operator' });
  await runRcaAdd(context, { path: 'rca-a.json' });
  await runRcaAdd(context, { path: 'rca-b.json' });
  await runRcaAdd(context, { path: 'rca-d.json' });
  await runRcaApprove(context, { defectId: 'alpha', approvedBy: 'reviewer' });
  await runRcaApprove(context, { defectId: 'beta', approvedBy: 'reviewer' });
  return context;
}

const DEFAULT_PATH = 'artifacts/reports/run-result-2026-10-16.md';

describe('runReport --output (P6-104)', () => {
  it('saves a full run-result report under the default path, dated by the clock', async () => {
    const context = await fullContext();

    const result = await runReport(context, { output: true });

    expect(result.reportPath).toBe(DEFAULT_PATH);
    const saved = await storeOf(context).readText(DEFAULT_PATH);
    expect(saved).toContain('| case-a | e2e | failed | 2026-10-16T09:01:00.000Z | 1 | result-1 |');
    expect(saved).toContain('- case-a (failed): The list request returned HTTP 500');
    expect(saved).toContain(
      '| run-1 | e2e | 2026-10-16T10:00:00.000Z | 2026-10-16T10:00:05.000Z | 1 | passed 1,',
    );
    expect(saved).toContain('WCAG 2.1 level AA, 1 scan(s).');
    expect(saved).toContain('| alpha | Defect alpha | major | functional | accepted |');
    expect(saved).toContain('| gamma | Defect gamma | major | functional | draft |');
    expect(saved).toContain('### alpha');
    expect(saved).toContain('1 root cause analysis(es) not approved are left out.');
    expect(saved).toContain('### beta');
    expect(saved.indexOf('### alpha')).toBeLessThan(saved.indexOf('### beta'));
    expect(saved.indexOf('| run-0 |')).toBeLessThan(saved.indexOf('| run-1 |'));
    expect(saved).not.toContain('### delta');
  });

  it('renders the same bytes twice', async () => {
    const context = await fullContext();

    await runReport(context, { output: true });
    const first = await storeOf(context).readText(DEFAULT_PATH);
    await runReport(context, { output: true });

    expect(await storeOf(context).readText(DEFAULT_PATH)).toBe(first);
  });

  it('saves to the path the caller names', async () => {
    const context = fakeContext(BASE_FILES);

    const result = await runReport(context, { output: 'docs/results.md' });

    expect(result.reportPath).toBe('docs/results.md');
    expect(await storeOf(context).readText('docs/results.md')).toContain('# Run result report');
  });

  it('leaves out the sections that have no data', async () => {
    const context = fakeContext({
      ...BASE_FILES,
      [join(QA_DIR, 'config.yaml')]: CONFIG_YAML.replace('a11y: in-scope', 'a11y: undecided'),
    });

    await runReport(context, { output: true });

    const saved = await storeOf(context).readText(DEFAULT_PATH);
    expect(saved).not.toContain('## Spec runs');
    expect(saved).not.toContain('## Accessibility');
    expect(saved).not.toContain('## Defects');
    expect(saved).not.toContain('## Root cause analysis');
  });

  it('leaves out the accessibility section when no scan was recorded', async () => {
    const context = fakeContext(BASE_FILES);

    await runReport(context, { output: true });

    expect(await storeOf(context).readText(DEFAULT_PATH)).not.toContain('## Accessibility');
  });

  it('saves a report of a project that only has a qa run record', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'config.yaml')]: CONFIG_YAML,
      [join(QA_DIR, 'runs', 'run-1', 'run.json')]: RUN_JSON,
    });

    await runReport(context, { output: true });

    const saved = await storeOf(context).readText(DEFAULT_PATH);
    expect(saved).toContain('## Spec runs');
    expect(saved).not.toContain('## Cases');
    expect(saved).not.toContain('## Summary');
  });

  it('writes nothing without --output', async () => {
    const context = fakeContext(BASE_FILES);

    const result = await runReport(context, {});

    expect(result.reportPath).toBeUndefined();
    expect(await storeOf(context).pathExists('artifacts/reports')).toBe(false);
  });

  it.each(['../outside.md', '/etc/report.md', 'reports\\x.md', 'report.txt'])(
    'refuses the unusable path %s',
    async (output) => {
      await expect(runReport(fakeContext(BASE_FILES), { output })).rejects.toMatchObject({
        code: 'REPORT_OUTPUT_INVALID',
      });
    },
  );

  it('refuses to save an HTML report', async () => {
    await expect(runReport(fakeContext(BASE_FILES), { output: true, format: 'html' })).rejects.toMatchObject({
      code: 'REPORT_OUTPUT_FORMAT',
    });
  });
});
