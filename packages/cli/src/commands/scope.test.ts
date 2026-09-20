// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { QaError } from '@qa-ai-stlc/core';
import { describe, expect, it } from 'vitest';
import { createCommandContext, type CommandContext } from '../command-context.js';
import { createFakeFileSystem } from '../test-support/fake-file-system.js';
import { runScope } from './scope.js';

const noopIo = { stdout: () => undefined, stderr: () => undefined };
const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

function fakeContext(files: Readonly<Record<string, string>> = {}): CommandContext {
  return createCommandContext({
    projectRoot: PROJECT_ROOT,
    io: noopIo,
    fs: createFakeFileSystem(files),
    env: {},
  });
}

describe('runScope', () => {
  it('extracts requirements from a file and writes the scope artifact', async () => {
    const context = fakeContext({
      [join(PROJECT_ROOT, 'docs', 'requirements.md')]: '## Login\nA user can log in.\n',
    });

    const result = await runScope(context, { from: 'file', path: 'docs/requirements.md' });

    expect(result).toEqual({ scopePath: 'artifacts/scope.json', added: 1, updated: 0, total: 1 });
    const scope = JSON.parse(await context.fs.readFile(join(QA_DIR, 'artifacts', 'scope.json'))) as {
      requirements: { id: string; source: unknown }[];
    };
    expect(scope.requirements[0]?.id).toBe('login');
    expect(scope.requirements[0]?.source).toEqual({ kind: 'file', path: 'docs/requirements.md' });
  });

  it('registers the scope artifact in the manifest', async () => {
    const context = fakeContext({
      [join(PROJECT_ROOT, 'docs', 'requirements.md')]: '## Login\nbody\n',
    });

    await runScope(context, { from: 'file', path: 'docs/requirements.md' });

    const manifest = JSON.parse(await context.fs.readFile(join(QA_DIR, 'manifest.json'))) as {
      artifacts: Record<string, unknown>;
    };
    expect(manifest.artifacts).toHaveProperty('artifacts/scope.json');
  });

  it('extracts requirements from literal text', async () => {
    const context = fakeContext();

    const result = await runScope(context, {
      from: 'text',
      content: '## Signup\nA user can sign up.\n',
      label: 'operator input',
    });

    expect(result).toEqual({ scopePath: 'artifacts/scope.json', added: 1, updated: 0, total: 1 });
  });

  it('merges a second call by id instead of duplicating', async () => {
    const context = fakeContext({
      [join(PROJECT_ROOT, 'docs', 'requirements.md')]: '## Login\nfirst version\n',
    });
    await runScope(context, { from: 'file', path: 'docs/requirements.md' });
    await context.fs.writeFile(join(PROJECT_ROOT, 'docs', 'requirements.md'), '## Login\nsecond version\n');

    const result = await runScope(context, { from: 'file', path: 'docs/requirements.md' });

    expect(result).toEqual({ scopePath: 'artifacts/scope.json', added: 0, updated: 1, total: 1 });
  });

  it('rejects an unknown --from value', async () => {
    const context = fakeContext();

    await expect(runScope(context, { from: 'screenshot' })).rejects.toThrow(QaError);
  });

  it('rejects --from file with no --path', async () => {
    const context = fakeContext();

    await expect(runScope(context, { from: 'file' })).rejects.toThrow(QaError);
  });

  it('rejects a --path that does not exist', async () => {
    const context = fakeContext();

    await expect(runScope(context, { from: 'file', path: 'docs/missing.md' })).rejects.toThrow(QaError);
  });

  it('rejects a --path outside the project', async () => {
    const context = fakeContext();

    await expect(runScope(context, { from: 'file', path: '../outside.md' })).rejects.toThrow(QaError);
  });

  it('rejects --from text with no --content or --label', async () => {
    const context = fakeContext();

    await expect(runScope(context, { from: 'text' })).rejects.toThrow(QaError);
    await expect(runScope(context, { from: 'text', content: 'x' })).rejects.toThrow(QaError);
  });
});
