// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QaError } from '@qa-ai-stlc/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNodeEngineContext } from './engine-context.js';

let workDir = '';

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'qa-engine-context-'));
  vi.stubEnv('QA_PROJECT_ROOT', '');
  vi.stubEnv('PLUGIN_ROOT', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(workDir, { recursive: true, force: true });
});

function codeOf(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof QaError ? error.code : undefined;
  }
  return undefined;
}

describe('createNodeEngineContext project root', () => {
  it('uses QA_PROJECT_ROOT when it names an existing directory', () => {
    const project = join(workDir, 'project');
    mkdirSync(project);
    vi.stubEnv('QA_PROJECT_ROOT', project);

    expect(createNodeEngineContext().projectRoot).toBe(project);
  });

  it('rejects a QA_PROJECT_ROOT that does not exist', () => {
    vi.stubEnv('QA_PROJECT_ROOT', join(workDir, 'missing'));

    expect(codeOf(createNodeEngineContext)).toBe('PROJECT_ROOT_INVALID');
  });

  it('rejects a QA_PROJECT_ROOT that is a file', () => {
    const file = join(workDir, 'file.txt');
    writeFileSync(file, 'x');
    vi.stubEnv('QA_PROJECT_ROOT', file);

    expect(codeOf(createNodeEngineContext)).toBe('PROJECT_ROOT_INVALID');
  });

  it('refuses to act when the working directory is the plugin directory', () => {
    vi.stubEnv('PLUGIN_ROOT', process.cwd());

    expect(codeOf(createNodeEngineContext)).toBe('PROJECT_ROOT_UNRESOLVED');
  });

  it('resolves from the working directory when neither variable is set', () => {
    expect(createNodeEngineContext().projectRoot).toMatch(/\S/);
  });
});
