// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { approveTool } from '../src/tools/approve.js';
import { casesAddTool } from '../src/tools/cases-add.js';
import { doctorTool } from '../src/tools/doctor.js';
import { exploreTool } from '../src/tools/explore.js';
import { scopeTool } from '../src/tools/scope.js';
import { validateTool } from '../src/tools/validate.js';

// Every engine tool builds its `EngineContext` from `process.cwd()` (engine-context.ts), matching
// how a real MCP client's process is launched with the project root as its working directory.
// These tests run against a real temporary project directory instead of a fake `FileSystem` —
// exactly the "same core call" P2-05 promises the CLI, proven by driving the real Node adapters
// rather than a substitute (AGENTS.md 13: an integration test crossing a module boundary).
describe('engine-operation tools (real filesystem, temp project directory)', () => {
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  it('qa.doctor reports config missing in a project with no .qa/ store', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);

      const result = await doctorTool.handler({});
      const resultWithFixOption = await doctorTool.handler({ fix: false });
      process.chdir(originalCwd);

      expect(result.ok).toBe(false);
      expect(result.checks.some((check) => check.name === 'config' && check.status === 'fail')).toBe(true);
      expect(resultWithFixOption.ok).toBe(false);
    });
  });

  it('qa.explore throws CONFIG_MISSING in a project with no .qa/ store, whatever options are given', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);

      const errorWithNoOptions = await exploreTool.handler({}).catch((caught: unknown) => caught);
      const errorWithEveryOption = await exploreTool
        .handler({
          environment: 'staging',
          identity: 'admin',
          cdpEndpointUrl: 'ws://localhost:9222',
          policy: 'testid-first',
          static: true,
          maxPages: 5,
          verify: true,
        })
        .catch((caught: unknown) => caught);
      process.chdir(originalCwd);

      expect(errorWithNoOptions).toMatchObject({ code: 'CONFIG_MISSING' });
      expect(errorWithEveryOption).toMatchObject({ code: 'CONFIG_MISSING' });
    });
  });

  it('drives the whole scope -> cases_add -> approve -> validate pipeline against a real project', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);
      await writeFile(join(projectRoot, 'requirements.md'), '## Login\nA user can log in.\n', 'utf-8');

      const scopeResult = await scopeTool.handler({ from: 'file', path: 'requirements.md' });
      expect(scopeResult).toEqual({ scopePath: 'artifacts/scope.json', added: 1, updated: 0, total: 1 });

      await writeFile(
        join(projectRoot, 'login-case.json'),
        JSON.stringify({
          id: 'login-case',
          requirementIds: ['login'],
          testType: 'e2e',
          title: 'Log in with valid credentials',
          steps: [{ description: 'Submit the login form' }],
          expectedResult: 'The user lands on the dashboard',
          status: 'draft',
          createdAt: '2026-09-20T12:00:00Z',
        }),
        'utf-8',
      );

      const casesResult = await casesAddTool.handler({ path: 'login-case.json' });
      expect(casesResult).toEqual({
        casePath: 'artifacts/cases/login-case.json',
        id: 'login-case',
        requirementIds: ['login'],
      });

      const approveResult = await approveTool.handler({
        gate: 'scope',
        artifactPath: scopeResult.scopePath,
        approvedBy: 'test',
      });
      expect(approveResult.gate).toBe('scope');
      expect(approveResult.state.gates.scope.status).toBe('satisfied');

      const reapproveResult = await approveTool.handler({
        gate: 'scope',
        artifactPath: scopeResult.scopePath,
        approvedBy: 'test',
        note: 'looks complete',
      });
      expect(reapproveResult.state.gates.scope.status).toBe('satisfied');

      const validateResult = await validateTool.handler({});
      expect(validateResult.reopened).toEqual([]);
      expect(validateResult.unlinkedCases).toEqual([]);
      expect(validateResult.state.gates.scope.status).toBe('satisfied');

      // Written directly, bypassing qa.cases_add's own check, to prove qa.validate re-sweeps
      // every already-registered case rather than trusting the check done at registration time.
      await mkdir(join(projectRoot, '.qa', 'artifacts', 'cases'), { recursive: true });
      await writeFile(
        join(projectRoot, '.qa', 'artifacts', 'cases', 'stale-case.json'),
        JSON.stringify({
          id: 'stale-case',
          requirementIds: ['removed-later'],
          testType: 'e2e',
          title: 'A case whose requirement no longer exists',
          steps: [{ description: 'Do something' }],
          expectedResult: 'Something happens',
          status: 'draft',
          createdAt: '2026-09-20T12:00:00Z',
        }),
        'utf-8',
      );
      const revalidateResult = await validateTool.handler({});
      process.chdir(originalCwd);

      expect(revalidateResult.unlinkedCases).toEqual([
        {
          casePath: 'artifacts/cases/stale-case.json',
          id: 'stale-case',
          unlinkedRequirementIds: ['removed-later'],
        },
      ]);
    });
  });

  it('rejects a hand-edited scope artifact on the next MCP mutation and reports it from qa.validate (P2-07)', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);
      await writeFile(join(projectRoot, 'requirements.md'), '## Login\nA user can log in.\n', 'utf-8');
      await scopeTool.handler({ from: 'file', path: 'requirements.md' });

      // Simulates an operator or a bug editing the artifact directly, bypassing every engine tool.
      await writeFile(
        join(projectRoot, '.qa', 'artifacts', 'scope.json'),
        JSON.stringify({ generatedAt: '2026-09-20T12:00:00Z', requirements: [] }),
        'utf-8',
      );

      const scopeError = await scopeTool
        .handler({ from: 'text', content: '## Signup\nbody\n', label: 'operator' })
        .catch((caught: unknown) => caught);

      await writeFile(
        join(projectRoot, 'case.json'),
        JSON.stringify({
          id: 'case-1',
          requirementIds: ['login'],
          testType: 'e2e',
          title: 'A case',
          steps: [{ description: 'Do something' }],
          expectedResult: 'Something happens',
          status: 'draft',
          createdAt: '2026-09-20T12:00:00Z',
        }),
        'utf-8',
      );
      const casesAddError = await casesAddTool
        .handler({ path: 'case.json' })
        .catch((caught: unknown) => caught);

      const validateResult = await validateTool.handler({});
      process.chdir(originalCwd);

      expect(scopeError).toMatchObject({ code: 'ARTIFACT_HASH_MISMATCH' });
      expect(casesAddError).toMatchObject({ code: 'ARTIFACT_HASH_MISMATCH' });
      expect(validateResult.tamperedArtifacts).toEqual(['artifacts/scope.json']);
    });
  });

  it('qa.cases_add rejects a case linking to a requirement missing from the scope artifact', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);
      await scopeTool.handler({ from: 'text', content: '## Known\nbody\n', label: 'operator' });
      await writeFile(
        join(projectRoot, 'bad-case.json'),
        JSON.stringify({
          id: 'bad-case',
          requirementIds: ['does-not-exist'],
          testType: 'e2e',
          title: 'A case',
          steps: [{ description: 'Do something' }],
          expectedResult: 'Something happens',
          status: 'draft',
          createdAt: '2026-09-20T12:00:00Z',
        }),
        'utf-8',
      );

      const error = await casesAddTool.handler({ path: 'bad-case.json' }).catch((caught: unknown) => caught);
      process.chdir(originalCwd);

      expect(error).toMatchObject({ code: 'CASE_UNLINKED_REQUIREMENT' });
    });
  });
});
