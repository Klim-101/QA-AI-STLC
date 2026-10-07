// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import type { DefectDraft, Rca } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { ApprovalLedgerStore } from '../approval-ledger-store.js';
import { DefectStore } from '../defect-store.js';
import type { EngineContext } from '../engine-context.js';
import { hashText } from '../hash.js';
import { toCanonicalJson } from '../json-file.js';
import { ManifestStore } from '../manifest-store.js';
import { noopLogger } from '../ports/logger.js';
import { QaStore } from '../qa-store.js';
import { RcaStore } from '../rca-store.js';
import { runDefectAccept, runDefectAdd } from './defect.js';
import { runRcaAdd, runRcaApprove } from './rca.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

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
  requirementIds: [],
  evidencePaths: [],
  status: 'draft',
  createdAt: '2026-10-07T12:00:00Z',
};

function rca(overrides: Partial<Rca> = {}): Rca {
  return {
    schemaVersion: 1,
    defectId: 'login-error',
    facts: ['The login request returns 401'],
    hypotheses: [{ description: 'The handler is not wired', confidence: 'medium' }],
    remediation: ['Render the error'],
    status: 'draft',
    createdAt: '2026-10-07T12:00:00Z',
    ...overrides,
  };
}

function fakeContext(): EngineContext {
  return {
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem({
      [join(PROJECT_ROOT, 'defect.json')]: JSON.stringify(DEFECT),
      [join(PROJECT_ROOT, 'rca.json')]: JSON.stringify(rca()),
    }),
    clock: { now: () => new Date('2026-10-07T12:30:00Z') },
    logger: noopLogger,
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeBrowserLauncher(),
    env: {},
  };
}

function stores(context: EngineContext): {
  readonly rcas: RcaStore;
  readonly defects: DefectStore;
  readonly ledger: ApprovalLedgerStore;
} {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const ledger = new ApprovalLedgerStore({ store, manifest });
  const defects = new DefectStore({ store, manifest, ledger });
  return { rcas: new RcaStore({ store, manifest, ledger, defects }), defects, ledger };
}

async function withAcceptedDefect(): Promise<EngineContext> {
  const context = fakeContext();
  await runDefectAdd(context, { path: 'defect.json' });
  await runDefectAccept(context, { id: 'login-error', approvedBy: 'operator' });
  return context;
}

async function withRegisteredRca(): Promise<EngineContext> {
  const context = await withAcceptedDefect();
  await runRcaAdd(context, { path: 'rca.json' });
  return context;
}

/** Changes the accepted defect's content the way a second, valid acceptance would, bypassing the engine's guard on re-adding. */
async function reacceptChangedDefect(context: EngineContext): Promise<void> {
  const { defects, ledger } = stores(context);
  const changed = { ...(await defects.read('login-error')), title: 'A different title' };
  const content = await defects.write(changed, toCanonicalJson(changed));
  await ledger.append({
    gate: 'defect:login-error',
    artifactPath: 'artifacts/defects/login-error.json',
    artifactSha256: hashText(content),
    approvedBy: 'operator',
    approvedAt: '2026-10-07T12:40:00.000Z',
  });
}

describe('runRcaAdd', () => {
  it('registers an RCA for an accepted defect and stamps the defect hash on it', async () => {
    const context = await withAcceptedDefect();

    const result = await runRcaAdd(context, { path: 'rca.json' });

    expect(result).toEqual({ defectId: 'login-error', rcaPath: 'artifacts/rca/login-error.json' });
    const stored = await stores(context).rcas.read('login-error');
    expect(stored.status).toBe('draft');
    expect(stored.defectSha256).toBe(
      hashText(await context.fs.readFile(join(QA_DIR, 'artifacts', 'defects', 'login-error.json'))),
    );
  });

  it('requires a path', async () => {
    await expect(runRcaAdd(fakeContext(), {})).rejects.toMatchObject({ code: 'RCA_ADD_USAGE' });
  });

  it('rejects a path that does not exist', async () => {
    await expect(runRcaAdd(fakeContext(), { path: 'missing.json' })).rejects.toMatchObject({
      code: 'RCA_ADD_FILE_NOT_FOUND',
    });
  });

  it.each(['approved', 'rejected'] as const)('rejects a new RCA that arrives as %s', async (status) => {
    const context = await withAcceptedDefect();
    await context.fs.writeFile(join(PROJECT_ROOT, 'rca.json'), JSON.stringify(rca({ status })));

    await expect(runRcaAdd(context, { path: 'rca.json' })).rejects.toMatchObject({
      code: 'RCA_ADD_STATUS_INVALID',
    });
  });

  it('fails with a coded error for a defect that is registered but not accepted', async () => {
    const context = fakeContext();
    await runDefectAdd(context, { path: 'defect.json' });

    await expect(runRcaAdd(context, { path: 'rca.json' })).rejects.toMatchObject({
      code: 'RCA_DEFECT_NOT_ACCEPTED',
    });
  });

  it('fails with a coded error for a defect that does not exist', async () => {
    await expect(runRcaAdd(fakeContext(), { path: 'rca.json' })).rejects.toMatchObject({
      code: 'RCA_DEFECT_NOT_ACCEPTED',
    });
  });

  it('replaces an RCA that was never approved', async () => {
    const context = await withRegisteredRca();
    await context.fs.writeFile(
      join(PROJECT_ROOT, 'rca.json'),
      JSON.stringify(rca({ facts: ['A better fact'] })),
    );

    await runRcaAdd(context, { path: 'rca.json' });

    expect((await stores(context).rcas.read('login-error')).facts).toEqual(['A better fact']);
  });

  it('never overwrites an approved RCA', async () => {
    const context = await withRegisteredRca();
    await runRcaApprove(context, { defectId: 'login-error', approvedBy: 'reviewer' });

    await expect(runRcaAdd(context, { path: 'rca.json' })).rejects.toMatchObject({
      code: 'RCA_ALREADY_APPROVED',
    });
  });
});

describe('runRcaApprove', () => {
  it('approves a registered RCA and binds the approval to the approved content', async () => {
    const context = await withRegisteredRca();

    const result = await runRcaApprove(context, {
      defectId: 'login-error',
      approvedBy: 'reviewer',
      note: 'Looks right',
    });

    expect(result).toEqual({ defectId: 'login-error', status: 'approved', wasAlreadyApproved: false });
    const { rcas, ledger } = stores(context);
    expect(await rcas.resolveStatus(await rcas.read('login-error'))).toBe('approved');
    const approval = await ledger.latestForGate('rca:login-error');
    expect(approval).toMatchObject({ approvedBy: 'reviewer', note: 'Looks right' });
    expect(approval?.artifactSha256).toBe(
      hashText(await context.fs.readFile(join(QA_DIR, 'artifacts', 'rca', 'login-error.json'))),
    );
  });

  it('leaves the note out when none is given and records nothing the second time', async () => {
    const context = await withRegisteredRca();
    await runRcaApprove(context, { defectId: 'login-error', approvedBy: 'reviewer' });

    const second = await runRcaApprove(context, { defectId: 'login-error', approvedBy: 'someone-else' });

    const { ledger } = stores(context);
    expect(second.wasAlreadyApproved).toBe(true);
    expect(await ledger.latestForGate('rca:login-error')).not.toHaveProperty('note');
    expect((await ledger.load()).approvals.filter((entry) => entry.gate === 'rca:login-error')).toHaveLength(
      1,
    );
  });

  it('requires a defect id and an approver', async () => {
    const context = await withRegisteredRca();

    await expect(runRcaApprove(context, { approvedBy: 'reviewer' })).rejects.toMatchObject({
      code: 'RCA_APPROVE_USAGE',
    });
    await expect(runRcaApprove(context, { defectId: 'login-error' })).rejects.toMatchObject({
      code: 'RCA_APPROVE_USAGE',
    });
  });

  it('reports an RCA that was never registered', async () => {
    const context = await withAcceptedDefect();

    await expect(
      runRcaApprove(context, { defectId: 'login-error', approvedBy: 'reviewer' }),
    ).rejects.toMatchObject({ code: 'RCA_NOT_FOUND' });
  });

  it('refuses a rejected RCA', async () => {
    const context = await withRegisteredRca();
    const { rcas } = stores(context);
    const rejected = { ...(await rcas.read('login-error')), status: 'rejected' as const };
    await rcas.write(rejected, toCanonicalJson(rejected));

    await expect(
      runRcaApprove(context, { defectId: 'login-error', approvedBy: 'reviewer' }),
    ).rejects.toMatchObject({ code: 'RCA_REJECTED' });
  });

  it('refuses to approve once the defect is no longer accepted', async () => {
    const context = await withRegisteredRca();
    const { defects } = stores(context);
    const reopened = { ...(await defects.read('login-error')), title: 'Edited after acceptance' };
    await defects.write(reopened, toCanonicalJson(reopened));

    await expect(
      runRcaApprove(context, { defectId: 'login-error', approvedBy: 'reviewer' }),
    ).rejects.toMatchObject({ code: 'RCA_DEFECT_NOT_ACCEPTED' });
  });

  it('refuses to approve an RCA written against an earlier version of the defect', async () => {
    const context = await withRegisteredRca();
    await reacceptChangedDefect(context);

    await expect(
      runRcaApprove(context, { defectId: 'login-error', approvedBy: 'reviewer' }),
    ).rejects.toMatchObject({ code: 'RCA_DEFECT_CHANGED' });
  });

  it('refuses an RCA file edited by hand after it was registered', async () => {
    const context = await withRegisteredRca();
    await context.fs.writeFile(
      join(QA_DIR, 'artifacts', 'rca', 'login-error.json'),
      toCanonicalJson(rca({ status: 'approved' })),
    );

    await expect(
      runRcaApprove(context, { defectId: 'login-error', approvedBy: 'reviewer' }),
    ).rejects.toMatchObject({ code: 'ARTIFACT_HASH_MISMATCH' });
  });
});

describe('RcaStore.resolveStatus', () => {
  it('keeps draft and rejected as they are', async () => {
    const { rcas } = stores(fakeContext());

    expect(await rcas.resolveStatus(rca({ status: 'draft' }))).toBe('draft');
    expect(await rcas.resolveStatus(rca({ status: 'rejected' }))).toBe('rejected');
  });

  it('reads an approved RCA back as draft once its defect changes', async () => {
    const context = await withRegisteredRca();
    await runRcaApprove(context, { defectId: 'login-error', approvedBy: 'reviewer' });
    const { rcas } = stores(context);
    const approved = await rcas.read('login-error');
    expect(await rcas.resolveStatus(approved)).toBe('approved');

    await reacceptChangedDefect(context);

    expect(await rcas.resolveStatus(approved)).toBe('draft');
  });

  it('reads an approved RCA back as draft when its defect is no longer accepted', async () => {
    const context = await withRegisteredRca();
    await runRcaApprove(context, { defectId: 'login-error', approvedBy: 'reviewer' });
    const { rcas, defects } = stores(context);
    const approved = await rcas.read('login-error');
    const edited = { ...(await defects.read('login-error')), title: 'Edited' };

    await defects.write(edited, toCanonicalJson(edited));

    expect(await rcas.resolveStatus(approved)).toBe('draft');
  });

  it('reads a file that merely claims approved as draft', async () => {
    const context = await withRegisteredRca();
    const { rcas } = stores(context);
    const claimed = { ...(await rcas.read('login-error')), status: 'approved' as const };
    await rcas.write(claimed, toCanonicalJson(claimed));

    expect(await rcas.resolveStatus(claimed)).toBe('draft');
  });

  it('reads an approved RCA back as draft when the approval is for a different file', async () => {
    const context = await withRegisteredRca();
    const { rcas, ledger } = stores(context);
    const claimed = { ...(await rcas.read('login-error')), status: 'approved' as const };
    const content = await rcas.write(claimed, toCanonicalJson(claimed));
    await ledger.append({
      gate: 'rca:login-error',
      artifactPath: 'artifacts/rca/other.json',
      artifactSha256: hashText(content),
      approvedBy: 'reviewer',
      approvedAt: '2026-10-07T12:40:00.000Z',
    });

    expect(await rcas.resolveStatus(claimed)).toBe('draft');
  });
});
