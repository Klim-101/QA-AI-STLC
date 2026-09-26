// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { EvidenceStore } from '../evidence-store.js';
import { hashText } from '../hash.js';
import { ManifestStore } from '../manifest-store.js';
import { noopLogger } from '../ports/logger.js';
import { systemClock } from '../ports/clock.js';
import { QaStore } from '../qa-store.js';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { runApprove } from './approve.js';
import { runValidate } from './validate.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

function fakeContext(files: Readonly<Record<string, string>> = {}): EngineContext {
  return {
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem(
      Object.fromEntries(Object.entries(files).map(([path, content]) => [join(QA_DIR, path), content])),
    ),
    clock: systemClock,
    logger: noopLogger,
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeBrowserLauncher(),
    env: {},
  };
}

describe('runValidate', () => {
  it('reports every gate open and nothing reopened on a fresh project', async () => {
    const context = fakeContext();

    const report = await runValidate(context);

    expect(report.state.gates.scope.status).toBe('open');
    expect(report.state.gates.cases.status).toBe('open');
    expect(report.reopened).toEqual([]);
  });

  it('does not report a never-approved gate as reopened', async () => {
    const context = fakeContext();

    const report = await runValidate(context);

    expect(report.reopened).not.toContain('scope');
  });

  it('reports a satisfied gate as reopened once its approved artifact changes', async () => {
    const context = fakeContext({
      'artifacts/scope.json': '{"requirements":[]}',
      'manifest.json': manifestJson({ 'artifacts/scope.json': '{"requirements":[]}' }),
    });
    await runApprove(context, {
      gate: 'scope',
      artifactPath: 'artifacts/scope.json',
      approvedBy: 'operator',
    });

    await context.fs.writeFile(join(QA_DIR, 'artifacts/scope.json'), '{"requirements":[{"id":"R1"}]}');
    const report = await runValidate(context);

    expect(report.state.gates.scope.status).toBe('open');
    expect(report.reopened).toEqual(['scope']);
  });

  it('reports a satisfied gate that still matches as satisfied, not reopened', async () => {
    const context = fakeContext({
      'artifacts/scope.json': '{"requirements":[]}',
      'manifest.json': manifestJson({ 'artifacts/scope.json': '{"requirements":[]}' }),
    });
    await runApprove(context, {
      gate: 'scope',
      artifactPath: 'artifacts/scope.json',
      approvedBy: 'operator',
    });

    const report = await runValidate(context);

    expect(report.state.gates.scope.status).toBe('satisfied');
    expect(report.reopened).toEqual([]);
  });

  it('reports no unlinked cases when none are registered', async () => {
    const context = fakeContext();

    const report = await runValidate(context);

    expect(report.unlinkedCases).toEqual([]);
  });

  it('reports no unlinked cases when every requirement id resolves', async () => {
    const context = fakeContext({
      'artifacts/scope.json': JSON.stringify({
        generatedAt: '2026-09-20T12:00:00Z',
        requirements: [{ id: 'r1', title: 'R1', source: { kind: 'text', label: 'x' }, inScope: true }],
      }),
      'artifacts/cases/checkout/case-1.json': JSON.stringify(testCase({ requirementIds: ['r1'] })),
    });

    const report = await runValidate(context);

    expect(report.unlinkedCases).toEqual([]);
  });

  it('reports a case whose requirement id does not resolve in the scope artifact', async () => {
    const context = fakeContext({
      'artifacts/scope.json': '{"generatedAt":"2026-09-20T12:00:00Z","requirements":[]}',
      'artifacts/cases/checkout/case-1.json': JSON.stringify(
        testCase({ id: 'case-1', requirementIds: ['missing'] }),
      ),
    });

    const report = await runValidate(context);

    expect(report.unlinkedCases).toEqual([
      { casePath: 'artifacts/cases/checkout/case-1.json', id: 'case-1', unlinkedRequirementIds: ['missing'] },
    ]);
  });

  it('resolves a case nested under its feature folder the same as any other (P2-20)', async () => {
    const context = fakeContext({
      'artifacts/scope.json': JSON.stringify({
        generatedAt: '2026-09-20T12:00:00Z',
        requirements: [{ id: 'r1', title: 'R1', source: { kind: 'text', label: 'x' }, inScope: true }],
      }),
      'artifacts/cases/checkout/case-1.json': JSON.stringify(
        testCase({ id: 'case-1', feature: 'checkout', requirementIds: ['r1'] }),
      ),
      'artifacts/cases/login/case-2.json': JSON.stringify(
        testCase({ id: 'case-2', feature: 'login', requirementIds: ['missing'] }),
      ),
    });

    const report = await runValidate(context);

    expect(report.unlinkedCases).toEqual([
      { casePath: 'artifacts/cases/login/case-2.json', id: 'case-2', unlinkedRequirementIds: ['missing'] },
    ]);
  });

  it('treats every requirement id as unlinked when there is no scope artifact at all', async () => {
    const context = fakeContext({
      'artifacts/cases/checkout/case-1.json': JSON.stringify(testCase({ requirementIds: ['r1'] })),
    });

    const report = await runValidate(context);

    expect(report.unlinkedCases).toHaveLength(1);
  });

  it('reports no unresolved test data when a case declares no testDataRefs', async () => {
    const context = fakeContext({
      'artifacts/cases/checkout/case-1.json': JSON.stringify(testCase({ requirementIds: ['r1'] })),
    });

    const report = await runValidate(context);

    expect(report.unresolvedTestData).toEqual([]);
  });

  it('reports no unresolved test data when every testDataRefs entry resolves', async () => {
    const context = fakeContext({
      'artifacts/test-data/checkout/valid-card.json': JSON.stringify({
        id: 'valid-card',
        feature: 'checkout',
        values: { cardNumber: '4111111111111111' },
      }),
      'artifacts/cases/checkout/case-1.json': JSON.stringify(
        testCase({ requirementIds: ['r1'], testDataRefs: ['valid-card'] }),
      ),
    });

    const report = await runValidate(context);

    expect(report.unresolvedTestData).toEqual([]);
  });

  it('reports a case whose testDataRefs entry does not resolve to a registered test-data set', async () => {
    const context = fakeContext({
      'artifacts/cases/checkout/case-1.json': JSON.stringify(
        testCase({ id: 'case-1', requirementIds: ['r1'], testDataRefs: ['missing-card'] }),
      ),
    });

    const report = await runValidate(context);

    expect(report.unresolvedTestData).toEqual([
      {
        casePath: 'artifacts/cases/checkout/case-1.json',
        id: 'case-1',
        unresolvedTestDataRefs: ['missing-card'],
      },
    ]);
  });

  it('reports no tampered artifacts on a fresh project with no manifest', async () => {
    const context = fakeContext();

    const report = await runValidate(context);

    expect(report.tamperedArtifacts).toEqual([]);
  });

  it('reports no tampered artifacts when every manifest entry matches its file', async () => {
    const context = fakeContext({
      'artifacts/scope.json': '{"requirements":[]}',
      'manifest.json': manifestJson({ 'artifacts/scope.json': '{"requirements":[]}' }),
    });

    const report = await runValidate(context);

    expect(report.tamperedArtifacts).toEqual([]);
  });

  it('reports a manifest entry whose file no longer matches its registered hash (P2-07)', async () => {
    const context = fakeContext({
      'artifacts/scope.json': '{"requirements":["hand-edited"]}',
      'manifest.json': manifestJson({ 'artifacts/scope.json': '{"requirements":[]}' }),
    });

    const report = await runValidate(context);

    expect(report.tamperedArtifacts).toEqual(['artifacts/scope.json']);
  });

  it('reports no tampered artifact for the locator module, registered outside .qa/ (regression, #396)', async () => {
    const locatorsContent = 'export function loginButton() { return null; }\n';
    const fs = createFakeFileSystem({
      [join(PROJECT_ROOT, 'tests', 'qa', 'locators.ts')]: locatorsContent,
      [join(QA_DIR, 'manifest.json')]: manifestJson({ 'tests/qa/locators.ts': locatorsContent }),
    });
    const context: EngineContext = {
      projectRoot: PROJECT_ROOT,
      fs,
      clock: systemClock,
      logger: noopLogger,
      processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
      httpClient: createFakeHttpClient({ ok: true, status: 200 }),
      browserLauncher: createFakeBrowserLauncher(),
      env: {},
    };

    const report = await runValidate(context);

    expect(report.tamperedArtifacts).toEqual([]);
  });

  it('reports the locator module tampered when its real, project-root content diverges from the manifest (regression, #396)', async () => {
    const fs = createFakeFileSystem({
      [join(PROJECT_ROOT, 'tests', 'qa', 'locators.ts')]: 'export function loginButton() { return null; }\n',
      [join(QA_DIR, 'manifest.json')]: manifestJson({
        'tests/qa/locators.ts': 'export function loginButton() { return "hand-edited"; }\n',
      }),
    });
    const context: EngineContext = {
      projectRoot: PROJECT_ROOT,
      fs,
      clock: systemClock,
      logger: noopLogger,
      processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
      httpClient: createFakeHttpClient({ ok: true, status: 200 }),
      browserLauncher: createFakeBrowserLauncher(),
      env: {},
    };

    const report = await runValidate(context);

    expect(report.tamperedArtifacts).toEqual(['tests/qa/locators.ts']);
  });

  it('reports no tampered artifacts for binary evidence registered through EvidenceStore (regression, #277)', async () => {
    const fs = createFakeFileSystem();
    const store = new QaStore({ projectRoot: PROJECT_ROOT, fs });
    const manifest = new ManifestStore({ store });
    const evidenceStore = new EvidenceStore({ store, manifest });

    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]);
    const registration = await evidenceStore.register({
      id: 'shot-1',
      runId: 'run-1',
      kind: 'screenshot',
      content: pngBytes,
    });
    expect(registration.status).toBe('registered');

    const context: EngineContext = {
      projectRoot: PROJECT_ROOT,
      fs,
      clock: systemClock,
      logger: noopLogger,
      processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
      httpClient: createFakeHttpClient({ ok: true, status: 200 }),
      browserLauncher: createFakeBrowserLauncher(),
      env: {},
    };

    const report = await runValidate(context);

    expect(report.tamperedArtifacts).toEqual([]);
  });

  it('reports binary evidence tampered by a CRLF-only edit (regression, #303)', async () => {
    const fs = createFakeFileSystem();
    const store = new QaStore({ projectRoot: PROJECT_ROOT, fs });
    const manifest = new ManifestStore({ store });
    const evidenceStore = new EvidenceStore({ store, manifest });

    const original = new TextEncoder().encode('line1\nline2\n');
    const registration = await evidenceStore.register({
      id: 'log-1',
      runId: 'run-1',
      kind: 'other',
      content: original,
    });
    if (registration.status !== 'registered') {
      throw new Error(`expected a registered result, got ${registration.status}`);
    }

    // A CRLF-only edit, made directly to the file the same way a hand-edit would be: registering
    // by mode: 'bytes' (#303) means this is caught, unlike the try-both hashing it replaces.
    await fs.writeFile(join(QA_DIR, registration.evidence.path), 'line1\r\nline2\r\n');

    const context: EngineContext = {
      projectRoot: PROJECT_ROOT,
      fs,
      clock: systemClock,
      logger: noopLogger,
      processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
      httpClient: createFakeHttpClient({ ok: true, status: 200 }),
      browserLauncher: createFakeBrowserLauncher(),
      env: {},
    };

    const report = await runValidate(context);

    expect(report.tamperedArtifacts).toEqual([registration.evidence.path]);
  });

  it('reports the approval ledger itself as tampered when hand-edited (regression, #278)', async () => {
    const scopeJson = '{"requirements":[]}';
    const context = fakeContext({
      'artifacts/scope.json': scopeJson,
      'manifest.json': manifestJson({ 'artifacts/scope.json': scopeJson }),
    });
    await runApprove(context, {
      gate: 'scope',
      artifactPath: 'artifacts/scope.json',
      approvedBy: 'operator',
    });

    // Forges the ledger to claim a different artifact hash was approved, without going through
    // approve() again -- the attack #278 describes. manifest.json is left untouched, since an
    // attacker who also fixes it up has defeated the manifest as a root of trust entirely, which
    // is a different, unsolved problem this fix does not claim to close.
    const ledgerPath = join(QA_DIR, 'artifacts/approval-ledger.json');
    const forgedLedger = JSON.parse(await context.fs.readFile(ledgerPath)) as {
      approvals: { artifactSha256: string }[];
    };
    const forgedApproval = forgedLedger.approvals[0];
    if (forgedApproval !== undefined) {
      forgedApproval.artifactSha256 = 'f'.repeat(64);
    }
    await context.fs.writeFile(ledgerPath, JSON.stringify(forgedLedger, null, 2) + '\n');

    const report = await runValidate(context);

    expect(report.tamperedArtifacts).toContain('artifacts/approval-ledger.json');
  });

  it('reports a hand-written approval ledger that was never registered as tampered, without falsely satisfying its gate (regression, #304)', async () => {
    const scopeJson = '{"requirements":[]}';
    const context = fakeContext({
      'artifacts/scope.json': scopeJson,
      'manifest.json': manifestJson({ 'artifacts/scope.json': scopeJson }),
      'artifacts/approval-ledger.json': JSON.stringify({
        schemaVersion: 1,
        approvals: [
          {
            gate: 'scope',
            artifactPath: 'artifacts/scope.json',
            artifactSha256: hashText(scopeJson),
            approvedBy: 'attacker',
            approvedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    });

    const report = await runValidate(context);

    expect(report.state.gates.scope.status).toBe('open');
    expect(report.state.currentPhase).toBe('scope');
    expect(report.tamperedArtifacts).toContain('artifacts/approval-ledger.json');
  });

  it('reports a manifest entry whose file was deleted', async () => {
    const context = fakeContext({
      'manifest.json': manifestJson({ 'artifacts/scope.json': '{"requirements":[]}' }),
    });

    const report = await runValidate(context);

    expect(report.tamperedArtifacts).toEqual(['artifacts/scope.json']);
  });

  it('reports caseSetStatusByType as undefined when there is no config.yaml yet', async () => {
    const context = fakeContext();

    const report = await runValidate(context);

    expect(report.caseSetStatusByType).toBeUndefined();
  });

  it('does not check run results when "checkRuns" is not requested', async () => {
    const context = fakeContext({
      'runs/run-1/results/result-1.json': runResultJson({
        id: 'result-1',
        runId: 'run-1',
        status: 'failed',
        evidenceIds: ['fabricated'],
      }),
    });

    const report = await runValidate(context);

    expect(report.unresolvedResultEvidence).toBeUndefined();
    expect(report.resultsMissingEvidence).toBeUndefined();
  });

  it('reports no run-result issues for a project with no runs yet, when "checkRuns" is requested', async () => {
    const context = fakeContext();

    const report = await runValidate(context, { checkRuns: true });

    expect(report.unresolvedResultEvidence).toEqual([]);
    expect(report.resultsMissingEvidence).toEqual([]);
  });

  it('reports a result whose evidenceIds names an id with no registered evidence file (fabricated link)', async () => {
    const context = fakeContext({
      'runs/run-1/results/result-1.json': runResultJson({
        id: 'result-1',
        runId: 'run-1',
        status: 'passed',
        evidenceIds: ['fabricated'],
      }),
    });

    const report = await runValidate(context, { checkRuns: true });

    expect(report.unresolvedResultEvidence).toEqual([
      {
        resultPath: 'runs/run-1/results/result-1.json',
        id: 'result-1',
        unresolvedEvidenceIds: ['fabricated'],
      },
    ]);
  });

  it('reports no unresolved evidence when every evidenceId has a matching registered file', async () => {
    const context = fakeContext({
      'runs/run-1/results/result-1.json': runResultJson({
        id: 'result-1',
        runId: 'run-1',
        status: 'passed',
        evidenceIds: ['shot-1'],
      }),
      'evidence/run-1/shot-1.png': 'fake-png-bytes',
    });

    const report = await runValidate(context, { checkRuns: true });

    expect(report.unresolvedResultEvidence).toEqual([]);
  });

  it('does not resolve a quarantined evidence id from its receipt file alone (regression)', async () => {
    const context = fakeContext({
      'runs/run-1/results/result-1.json': runResultJson({
        id: 'result-1',
        runId: 'run-1',
        status: 'passed',
        evidenceIds: ['quarantined-1'],
      }),
      'evidence/run-1/quarantined-1.quarantine.json': JSON.stringify({
        id: 'quarantined-1',
        runId: 'run-1',
        kind: 'console-log',
        createdAt: '2026-09-25T10:00:00.000Z',
        reason: 'secret-detected',
        patterns: ['bearer-token'],
      }),
    });

    const report = await runValidate(context, { checkRuns: true });

    expect(report.unresolvedResultEvidence).toEqual([
      {
        resultPath: 'runs/run-1/results/result-1.json',
        id: 'result-1',
        unresolvedEvidenceIds: ['quarantined-1'],
      },
    ]);
  });

  it('reports a failed result with zero evidence as missing coverage', async () => {
    const context = fakeContext({
      'runs/run-1/results/result-1.json': runResultJson({
        id: 'result-1',
        runId: 'run-1',
        status: 'failed',
        evidenceIds: [],
      }),
    });

    const report = await runValidate(context, { checkRuns: true });

    expect(report.resultsMissingEvidence).toEqual([
      { resultPath: 'runs/run-1/results/result-1.json', id: 'result-1' },
    ]);
  });

  it('does not report a passed result with zero evidence as missing coverage', async () => {
    const context = fakeContext({
      'runs/run-1/results/result-1.json': runResultJson({
        id: 'result-1',
        runId: 'run-1',
        status: 'passed',
        evidenceIds: [],
      }),
    });

    const report = await runValidate(context, { checkRuns: true });

    expect(report.resultsMissingEvidence).toEqual([]);
  });

  it('resolves an evidence file with no extension by its whole filename', async () => {
    const context = fakeContext({
      'runs/run-1/results/result-1.json': runResultJson({
        id: 'result-1',
        runId: 'run-1',
        status: 'passed',
        evidenceIds: ['shot-1'],
      }),
      'evidence/run-1/shot-1': 'fake-bytes-with-no-extension',
    });

    const report = await runValidate(context, { checkRuns: true });

    expect(report.unresolvedResultEvidence).toEqual([]);
  });

  it('reuses one directory listing per runId across more than one result', async () => {
    const context = fakeContext({
      'runs/run-1/results/result-1.json': runResultJson({
        id: 'result-1',
        runId: 'run-1',
        status: 'passed',
        evidenceIds: ['shot-1'],
      }),
      'runs/run-1/results/result-2.json': runResultJson({
        id: 'result-2',
        runId: 'run-1',
        status: 'passed',
        evidenceIds: ['shot-1'],
      }),
      'evidence/run-1/shot-1.png': 'fake-png-bytes',
    });

    const report = await runValidate(context, { checkRuns: true });

    expect(report.unresolvedResultEvidence).toEqual([]);
  });

  it("reports every case-bearing type's status by testing scope (P2-16)", async () => {
    const context = fakeContext({
      'config.yaml': [
        'schemaVersion: 1',
        'testing: { e2e: in-scope, api: out-of-scope, a11y: in-scope, security: out-of-scope }',
        'environments: {}',
        'identities: {}',
        'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
        'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
        'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
        '',
      ].join('\n'),
      'artifacts/cases/checkout/case-1.json': JSON.stringify(testCase({ requirementIds: ['r1'] })),
    });

    const report = await runValidate(context);

    expect(report.caseSetStatusByType).toEqual({ e2e: 'satisfied', api: 'not-applicable', a11y: 'missing' });
  });
});

/** A `.qa/manifest.json` registering each of `contentByPath`'s entries under its own hash. */
function manifestJson(contentByPath: Readonly<Record<string, string>>): string {
  return JSON.stringify({
    schemaVersion: 1,
    artifacts: Object.fromEntries(
      Object.entries(contentByPath).map(([path, content]) => [
        path,
        { sha256: hashText(content), mode: 'text', registeredAt: '2026-09-20T12:00:00Z' },
      ]),
    ),
  });
}

function runResultJson(overrides: {
  id: string;
  runId: string;
  status: string;
  evidenceIds: string[];
}): string {
  return JSON.stringify({
    id: overrides.id,
    runId: overrides.runId,
    testCaseId: 'case-1',
    testType: 'e2e',
    status: overrides.status,
    startedAt: '2026-09-25T09:59:00.000Z',
    finishedAt: '2026-09-25T10:00:00.000Z',
    evidenceIds: overrides.evidenceIds,
    ...(overrides.status === 'failed' ? { failure: { message: 'boom' } } : {}),
  });
}

function testCase(overrides: {
  id?: string;
  feature?: string;
  requirementIds: string[];
  testDataRefs?: string[];
}): Record<string, unknown> {
  return {
    id: overrides.id ?? 'case-1',
    feature: overrides.feature ?? 'checkout',
    requirementIds: overrides.requirementIds,
    testType: 'e2e',
    title: 'A case',
    steps: [{ description: 'Do something' }],
    expectedResult: 'Something happens',
    status: 'draft',
    createdAt: '2026-09-20T12:00:00Z',
    ...(overrides.testDataRefs !== undefined ? { testDataRefs: overrides.testDataRefs } : {}),
  };
}
