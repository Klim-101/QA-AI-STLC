// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { hashText } from '../hash.js';
import { noopLogger } from '../ports/logger.js';
import { systemClock } from '../ports/clock.js';
import { createFakeBrowserLauncher } from '../test-support/fake-browser-launcher.js';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '../test-support/fake-http-client.js';
import { createFakeProcessRunner } from '../test-support/fake-process-runner.js';
import { runApprove } from './approve.js';

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

/** A `.qa/manifest.json` registering each of `contentByPath`'s entries under its own hash (P2-07). */
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

/** A registered scope artifact plus the manifest entry that registers it, the way `qa scope`
 * leaves a project (needed since #278: `runApprove` only accepts a manifest-registered artifact). */
function fakeContextWithRegisteredScope(scopeJson = '{"requirements":[]}'): EngineContext {
  return fakeContext({
    'artifacts/scope.json': scopeJson,
    'manifest.json': manifestJson({ 'artifacts/scope.json': scopeJson }),
  });
}

describe('runApprove', () => {
  it('approves the scope gate and advances the pipeline to cases', async () => {
    const context = fakeContextWithRegisteredScope();

    const result = await runApprove(context, {
      gate: 'scope',
      artifactPath: 'artifacts/scope.json',
      approvedBy: 'operator',
    });

    expect(result.gate).toBe('scope');
    expect(result.state.gates.scope.status).toBe('satisfied');
    expect(result.state.currentPhase).toBe('cases');
  });

  it('records an optional note on the approval', async () => {
    const context = fakeContextWithRegisteredScope();

    await runApprove(context, {
      gate: 'scope',
      artifactPath: 'artifacts/scope.json',
      approvedBy: 'operator',
      note: 'looks complete',
    });

    const ledger = JSON.parse(await context.fs.readFile(join(QA_DIR, 'artifacts/approval-ledger.json'))) as {
      approvals: { note?: string }[];
    };
    expect(ledger.approvals[0]?.note).toBe('looks complete');
  });

  it('rejects an unknown gate name', async () => {
    const context = fakeContext();

    await expect(
      runApprove(context, { gate: 'run', artifactPath: 'artifacts/run.json', approvedBy: 'operator' }),
    ).rejects.toThrow(QaError);
  });

  it('rejects an artifact path outside the project', async () => {
    const context = fakeContext();

    await expect(
      runApprove(context, { gate: 'scope', artifactPath: '../outside.json', approvedBy: 'operator' }),
    ).rejects.toThrow(QaError);
  });

  it('rejects approving a later phase before an earlier one is satisfied', async () => {
    const casesJson = '{"cases":[]}';
    const context = fakeContext({
      'artifacts/cases.json': casesJson,
      'manifest.json': manifestJson({ 'artifacts/cases.json': casesJson }),
    });

    const error = await runApprove(context, {
      gate: 'cases',
      artifactPath: 'artifacts/cases.json',
      approvedBy: 'operator',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('GATE_OUT_OF_ORDER');
  });

  it('rejects approving a gate whose artifact does not exist', async () => {
    const context = fakeContext();

    await expect(
      runApprove(context, {
        gate: 'scope',
        artifactPath: 'artifacts/scope.json',
        approvedBy: 'operator',
      }),
    ).rejects.toThrow(QaError);
  });

  it('rejects approving an artifact that exists but was never registered in the manifest (regression, #278)', async () => {
    // Written directly, the way a hand-placed or agent-bypassed file would be -- no manifest.json.
    const context = fakeContext({ 'artifacts/scope.json': '{"requirements":[]}' });

    const error = await runApprove(context, {
      gate: 'scope',
      artifactPath: 'artifacts/scope.json',
      approvedBy: 'operator',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('ARTIFACT_UNREGISTERED');
  });

  it('rejects approving the scope gate with an unrelated registered artifact (regression, #305)', async () => {
    const unrelatedJson = '{"anything":true}';
    const context = fakeContext({
      'artifacts/unrelated.json': unrelatedJson,
      'manifest.json': manifestJson({ 'artifacts/unrelated.json': unrelatedJson }),
    });

    const error = await runApprove(context, {
      gate: 'scope',
      artifactPath: 'artifacts/unrelated.json',
      approvedBy: 'operator',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('GATE_ARTIFACT_PATH_MISMATCH');
  });
});
