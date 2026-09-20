// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCommandContext, type CommandContext } from '../command-context.js';
import { createFakeFileSystem } from '../test-support/fake-file-system.js';
import { runApprove } from './approve.js';
import { runValidate } from './validate.js';

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
    const context = fakeContext({ 'artifacts/scope.json': '{"requirements":[]}' });
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
    const context = fakeContext({ 'artifacts/scope.json': '{"requirements":[]}' });
    await runApprove(context, {
      gate: 'scope',
      artifactPath: 'artifacts/scope.json',
      approvedBy: 'operator',
    });

    const report = await runValidate(context);

    expect(report.state.gates.scope.status).toBe('satisfied');
    expect(report.reopened).toEqual([]);
  });
});
