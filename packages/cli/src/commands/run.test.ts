// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCommandContext } from '../command-context.js';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { runRun } from './run.js';

const PROJECT_ROOT = join('project');

const CONFIG_NO_ENVIRONMENTS = [
  'schemaVersion: 1',
  'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
  'environments: {}',
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

function fakeContext() {
  return createCommandContext({
    projectRoot: PROJECT_ROOT,
    io: { stdout: () => undefined, stderr: () => undefined },
    fs: createFakeFileSystem({ [join(PROJECT_ROOT, '.qa', 'config.yaml')]: CONFIG_NO_ENVIRONMENTS }),
  });
}

describe('runRun', () => {
  it('resolves the e2e test type to the Playwright runner and delegates to core', async () => {
    const context = fakeContext();

    // No environment is configured, so `core`'s own `runTestRun` throws while resolving one — a
    // failure that can only happen after the `e2e` runner was already selected and handed off,
    // proving the dispatch worked without needing a real Playwright process to run.
    await expect(runRun(context, { specFiles: ['tests/login.playwright-spec.ts'] })).rejects.toThrow(
      expect.objectContaining({ code: 'BROWSER_ENVIRONMENT_AMBIGUOUS' }) as Error,
    );
  });

  it('dispatches the a11y test type to the a11y runner', async () => {
    const context = fakeContext();

    // Same proof as the e2e dispatch test above: core fails resolving an environment only after the
    // runner for the test type was selected.
    await expect(runRun(context, { specFiles: ['tests/x.spec.ts'], testType: 'a11y' })).rejects.toThrow(
      expect.objectContaining({ code: 'BROWSER_ENVIRONMENT_AMBIGUOUS' }) as Error,
    );
  });

  it('dispatches the api test type to the api runner', async () => {
    const context = fakeContext();

    // Same proof as the e2e dispatch test above: core fails resolving an environment only after the
    // runner for the test type was selected.
    await expect(runRun(context, { specFiles: ['tests/x.spec.ts'], testType: 'api' })).rejects.toThrow(
      expect.objectContaining({ code: 'BROWSER_ENVIRONMENT_AMBIGUOUS' }) as Error,
    );
  });

  it('forwards a given environment name to core', async () => {
    const context = fakeContext();

    // Resolving a *named* environment against zero configured ones fails differently
    // (BROWSER_ENVIRONMENT_UNKNOWN) than resolving none at all (BROWSER_ENVIRONMENT_AMBIGUOUS,
    // covered above) — proves `environment` actually reached `core`, not just `specFiles`.
    await expect(runRun(context, { specFiles: ['tests/x.spec.ts'], environment: 'staging' })).rejects.toThrow(
      expect.objectContaining({ code: 'BROWSER_ENVIRONMENT_UNKNOWN' }) as Error,
    );
  });
});
