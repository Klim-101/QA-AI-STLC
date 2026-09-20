// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { QaError } from '@qa-ai-stlc/core';
import { describe, expect, it } from 'vitest';
import { createCommandContext, type CommandContext } from '../command-context.js';
import { createFakeFileSystem } from '../test-support/fake-file-system.js';
import { runApprove } from './approve.js';

const noopIo = { stdout: () => undefined, stderr: () => undefined };
const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

function fakeContext(files: Readonly<Record<string, string>> = {}): CommandContext {
  return createCommandContext({
    projectRoot: PROJECT_ROOT,
    io: noopIo,
    fs: createFakeFileSystem(
      Object.fromEntries(Object.entries(files).map(([path, content]) => [join(QA_DIR, path), content])),
    ),
    env: {},
  });
}

describe('runApprove', () => {
  it('approves the scope gate and advances the pipeline to cases', async () => {
    const context = fakeContext({ 'artifacts/scope.json': '{"requirements":[]}' });

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
    const context = fakeContext({ 'artifacts/scope.json': '{"requirements":[]}' });

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
    const context = fakeContext({ 'artifacts/cases.json': '{"cases":[]}' });

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
});
