// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { checkPlaywrightTestResolvable, isPlaywrightSpecInScope } from './playwright-test-doctor.js';

const INSTALLED = join('node_modules', '@playwright', 'test', 'package.json');

describe('checkPlaywrightTestResolvable', () => {
  it('passes when the package is installed in the project root', async () => {
    const fs = createFakeFileSystem({ [join('project', INSTALLED)]: '{}' });

    expect(await checkPlaywrightTestResolvable(fs, 'project')).toStrictEqual({
      name: 'playwright-test',
      status: 'pass',
      message: '@playwright/test resolves from the project root',
    });
  });

  it('passes when it is installed in a directory above the project, as Node resolves it', async () => {
    const fs = createFakeFileSystem({ [join('workspace', INSTALLED)]: '{}' });

    const result = await checkPlaywrightTestResolvable(fs, join('workspace', 'packages', 'app'));

    expect(result.status).toBe('pass');
  });

  it('fails with the install command when no directory up to the filesystem root has it', async () => {
    const fs = createFakeFileSystem();

    const result = await checkPlaywrightTestResolvable(fs, resolve('project'));

    expect(result).toMatchObject({ name: 'playwright-test', status: 'fail' });
    expect(result.remediation).toContain('npm install --save-dev --save-exact @qa-ai-stlc/cli');
    expect(result.remediation).toContain('npm init -y');
  });

  it('stops at a relative root instead of walking forever', async () => {
    const result = await checkPlaywrightTestResolvable(createFakeFileSystem(), 'project');

    expect(result.status).toBe('fail');
  });
});

describe('isPlaywrightSpecInScope', () => {
  const none = {
    e2e: 'out-of-scope',
    api: 'out-of-scope',
    a11y: 'out-of-scope',
    security: 'in-scope',
  } as const;

  it('is false when no testing type that generates specs is in scope, security included', () => {
    expect(isPlaywrightSpecInScope(none)).toBe(false);
    expect(isPlaywrightSpecInScope({ ...none, e2e: 'undecided' })).toBe(false);
  });

  it.each(['e2e', 'api', 'a11y'] as const)('is true when %s alone is in scope', (type) => {
    expect(isPlaywrightSpecInScope({ ...none, [type]: 'in-scope' })).toBe(true);
  });
});
