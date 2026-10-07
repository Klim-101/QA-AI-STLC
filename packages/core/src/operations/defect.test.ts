// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import type { DefectDraft } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { ApprovalLedgerStore } from '../approval-ledger-store.js';
import { DefectStore } from '../defect-store.js';
import type { EngineContext } from '../engine-context.js';
import { hashText } from '../hash.js';
import { toCanonicalJson } from '../json-file.js';
import { ManifestStore } from '../manifest-store.js';
import { noopLogger } from '../ports/logger.js';
import { QaStore } from '../qa-store.js';
import { runDefectAccept, runDefectAdd } from './defect.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');
const EVIDENCE_PATH = 'evidence/run-1/screenshot-1.png';

const SCOPE_JSON = JSON.stringify({
  generatedAt: '2026-10-06T12:00:00Z',
  requirements: [{ id: 'r1', title: 'R1', source: { kind: 'text', label: 'x' }, inScope: true }],
});

function draft(overrides: Partial<DefectDraft> = {}): DefectDraft {
  return {
    schemaVersion: 1,
    id: 'login-error',
    title: 'Invalid credentials show no error',
    severityProposal: 'major',
    category: 'functional',
    steps: ['Open the login page', 'Submit bad credentials'],
    expectedResult: 'An error message is shown',
    actualResult: 'Nothing is shown',
    environment: 'staging',
    requirementIds: ['r1'],
    evidencePaths: [EVIDENCE_PATH],
    status: 'draft',
    createdAt: '2026-10-06T12:00:00Z',
    ...overrides,
  };
}

// A manifest as earlier engine calls would have left it: the scope and one piece of evidence.
const MANIFEST_JSON = JSON.stringify({
  schemaVersion: 1,
  artifacts: {
    'artifacts/scope.json': {
      sha256: hashText(SCOPE_JSON),
      mode: 'text',
      registeredAt: '2026-10-06T12:00:00Z',
    },
    [EVIDENCE_PATH]: { sha256: 'a'.repeat(64), mode: 'bytes', registeredAt: '2026-10-06T12:00:00Z' },
  },
});

function fakeContext(files: Readonly<Record<string, string>> = {}): EngineContext {
  return {
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem({
      [join(QA_DIR, 'artifacts', 'scope.json')]: SCOPE_JSON,
      [join(QA_DIR, 'manifest.json')]: MANIFEST_JSON,
      ...files,
    }),
    clock: { now: () => new Date('2026-10-06T12:30:00Z') },
    logger: noopLogger,
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeBrowserLauncher(),
    env: {},
  };
}

function contextWithDraftFile(value: DefectDraft = draft()): EngineContext {
  return fakeContext({ [join(PROJECT_ROOT, 'defects', 'd.json')]: JSON.stringify(value) });
}

function stores(context: EngineContext): {
  readonly defects: DefectStore;
  readonly ledger: ApprovalLedgerStore;
} {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const ledger = new ApprovalLedgerStore({ store, manifest });
  return { defects: new DefectStore({ store, manifest, ledger }), ledger };
}

describe('runDefectAdd', () => {
  it('registers a valid draft under artifacts/defects and reports what it links to', async () => {
    const context = contextWithDraftFile();

    const result = await runDefectAdd(context, { path: 'defects/d.json' });

    expect(result).toEqual({
      id: 'login-error',
      defectPath: 'artifacts/defects/login-error.json',
      requirementIds: ['r1'],
      evidencePaths: [EVIDENCE_PATH],
    });
    expect((await stores(context).defects.read('login-error')).title).toBe(draft().title);
  });

  it('accepts a draft that cites no requirement and no evidence on a project with no scope yet', async () => {
    const context: EngineContext = {
      ...fakeContext(),
      fs: createFakeFileSystem({
        [join(PROJECT_ROOT, 'defects', 'd.json')]: JSON.stringify(
          draft({ requirementIds: [], evidencePaths: [] }),
        ),
      }),
    };

    await expect(runDefectAdd(context, { path: 'defects/d.json' })).resolves.toMatchObject({
      id: 'login-error',
    });
  });

  it('requires a path', async () => {
    await expect(runDefectAdd(fakeContext(), {})).rejects.toMatchObject({ code: 'DEFECT_ADD_USAGE' });
  });

  it('rejects a path that does not exist', async () => {
    await expect(runDefectAdd(fakeContext(), { path: 'defects/missing.json' })).rejects.toMatchObject({
      code: 'DEFECT_ADD_FILE_NOT_FOUND',
    });
  });

  it.each(['accepted', 'rejected'] as const)('rejects a new draft that arrives as %s', async (status) => {
    const context = contextWithDraftFile(draft({ status }));

    await expect(runDefectAdd(context, { path: 'defects/d.json' })).rejects.toMatchObject({
      code: 'DEFECT_ADD_STATUS_INVALID',
    });
  });

  it('rejects a requirement that is not in the scope artifact', async () => {
    const context = contextWithDraftFile(draft({ requirementIds: ['r1', 'ghost'] }));

    await expect(runDefectAdd(context, { path: 'defects/d.json' })).rejects.toMatchObject({
      code: 'DEFECT_UNLINKED_REQUIREMENT',
    });
  });

  it('rejects evidence the engine never registered', async () => {
    const context = contextWithDraftFile(
      draft({ evidencePaths: [EVIDENCE_PATH, 'evidence/run-1/forged.png'] }),
    );

    await expect(runDefectAdd(context, { path: 'defects/d.json' })).rejects.toMatchObject({
      code: 'DEFECT_EVIDENCE_UNREGISTERED',
    });
  });

  it('replaces an earlier draft that was never accepted', async () => {
    const context = contextWithDraftFile();
    await runDefectAdd(context, { path: 'defects/d.json' });
    await context.fs.writeFile(
      join(PROJECT_ROOT, 'defects', 'd.json'),
      JSON.stringify(draft({ title: 'A better title' })),
    );

    await runDefectAdd(context, { path: 'defects/d.json' });

    expect((await stores(context).defects.read('login-error')).title).toBe('A better title');
  });

  it('never overwrites an accepted draft', async () => {
    const context = contextWithDraftFile();
    await runDefectAdd(context, { path: 'defects/d.json' });
    await runDefectAccept(context, { id: 'login-error', approvedBy: 'operator' });

    await expect(runDefectAdd(context, { path: 'defects/d.json' })).rejects.toMatchObject({
      code: 'DEFECT_ALREADY_ACCEPTED',
    });
  });
});

describe('runDefectAccept', () => {
  async function registered(value: DefectDraft = draft()): Promise<EngineContext> {
    const context = contextWithDraftFile(value);
    await runDefectAdd(context, { path: 'defects/d.json' });
    return context;
  }

  it('accepts a registered draft and binds the approval to the accepted content', async () => {
    const context = await registered();

    const result = await runDefectAccept(context, {
      id: 'login-error',
      approvedBy: 'operator',
      note: 'Confirmed',
    });

    expect(result).toEqual({ id: 'login-error', status: 'accepted', wasAlreadyAccepted: false });
    const { defects, ledger } = stores(context);
    const accepted = await defects.read('login-error');
    expect(accepted.status).toBe('accepted');
    expect(await defects.resolveStatus(accepted)).toBe('accepted');
    const approval = await ledger.latestForGate('defect:login-error');
    expect(approval).toMatchObject({
      artifactPath: 'artifacts/defects/login-error.json',
      approvedBy: 'operator',
      approvedAt: '2026-10-06T12:30:00.000Z',
      note: 'Confirmed',
    });
    expect(approval?.artifactSha256).toBe(
      hashText(await context.fs.readFile(join(QA_DIR, 'artifacts', 'defects', 'login-error.json'))),
    );
  });

  it('leaves the note out of the approval when none is given', async () => {
    const context = await registered();

    await runDefectAccept(context, { id: 'login-error', approvedBy: 'operator' });

    expect(await stores(context).ledger.latestForGate('defect:login-error')).not.toHaveProperty('note');
  });

  it('records nothing the second time', async () => {
    const context = await registered();
    await runDefectAccept(context, { id: 'login-error', approvedBy: 'operator' });

    const second = await runDefectAccept(context, { id: 'login-error', approvedBy: 'someone-else' });

    expect(second.wasAlreadyAccepted).toBe(true);
    expect((await stores(context).ledger.load()).approvals).toHaveLength(1);
  });

  it('requires an id and an approver', async () => {
    const context = await registered();

    await expect(runDefectAccept(context, { approvedBy: 'operator' })).rejects.toMatchObject({
      code: 'DEFECT_ACCEPT_USAGE',
    });
    await expect(runDefectAccept(context, { id: 'login-error' })).rejects.toMatchObject({
      code: 'DEFECT_ACCEPT_USAGE',
    });
  });

  it('reports a draft that was never registered', async () => {
    await expect(
      runDefectAccept(fakeContext(), { id: 'nope', approvedBy: 'operator' }),
    ).rejects.toMatchObject({
      code: 'DEFECT_NOT_FOUND',
    });
  });

  it('refuses an id that is not a plain slug', async () => {
    await expect(
      runDefectAccept(fakeContext(), { id: '../scope', approvedBy: 'operator' }),
    ).rejects.toMatchObject({ code: 'DEFECT_ID_INVALID' });
  });

  it('refuses a draft edited by hand after it was registered', async () => {
    const context = await registered();
    await context.fs.writeFile(
      join(QA_DIR, 'artifacts', 'defects', 'login-error.json'),
      toCanonicalJson(draft({ status: 'accepted' })),
    );

    await expect(
      runDefectAccept(context, { id: 'login-error', approvedBy: 'operator' }),
    ).rejects.toMatchObject({
      code: 'ARTIFACT_HASH_MISMATCH',
    });
  });

  it('refuses a rejected draft', async () => {
    const context = await registered();
    const { defects } = stores(context);
    await defects.write(draft({ status: 'rejected' }), toCanonicalJson(draft({ status: 'rejected' })));

    await expect(
      runDefectAccept(context, { id: 'login-error', approvedBy: 'operator' }),
    ).rejects.toMatchObject({
      code: 'DEFECT_REJECTED',
    });
  });

  it('still needs an approval for a draft whose file merely claims accepted', async () => {
    const context = await registered();
    const { defects, ledger } = stores(context);
    await defects.write(draft({ status: 'accepted' }), toCanonicalJson(draft({ status: 'accepted' })));
    expect(await defects.resolveStatus(draft({ status: 'accepted' }))).toBe('draft');

    const result = await runDefectAccept(context, { id: 'login-error', approvedBy: 'operator' });

    expect(result.wasAlreadyAccepted).toBe(false);
    expect(await ledger.latestForGate('defect:login-error')).toMatchObject({ approvedBy: 'operator' });
  });
});

describe('DefectStore.resolveStatus', () => {
  it('keeps draft and rejected as they are', async () => {
    const { defects } = stores(fakeContext());

    expect(await defects.resolveStatus(draft({ status: 'draft' }))).toBe('draft');
    expect(await defects.resolveStatus(draft({ status: 'rejected' }))).toBe('rejected');
  });

  it('reads an accepted draft back as draft when the approval is for a different file', async () => {
    const context = contextWithDraftFile();
    await runDefectAdd(context, { path: 'defects/d.json' });
    const { defects, ledger } = stores(context);
    const accepted = draft({ status: 'accepted' });
    const content = await defects.write(accepted, toCanonicalJson(accepted));
    await ledger.append({
      gate: 'defect:login-error',
      artifactPath: 'artifacts/defects/other.json',
      artifactSha256: hashText(content),
      approvedBy: 'operator',
      approvedAt: '2026-10-06T12:30:00.000Z',
    });

    expect(await defects.resolveStatus(accepted)).toBe('draft');
  });

  it('reads an accepted draft back as draft once its content no longer matches the approval', async () => {
    const context = contextWithDraftFile();
    await runDefectAdd(context, { path: 'defects/d.json' });
    await runDefectAccept(context, { id: 'login-error', approvedBy: 'operator' });
    const { defects } = stores(context);
    const edited = { ...(await defects.read('login-error')), title: 'Edited after approval' };

    await defects.write(edited, toCanonicalJson(edited));

    expect(await defects.resolveStatus(edited)).toBe('draft');
  });
});
