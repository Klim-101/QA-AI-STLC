// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import type { ProcessResult, ProcessRunner } from '@qa-ai-stlc/core';
import { describe, expect, it } from 'vitest';
import { runCodeCheck } from '../test-support/run-code-check.js';
import { FIXTURE_PROJECT_ROOT, sourceFixture } from '../test-support/source-fixture.js';
import { dependenciesCheck } from './dependencies-check.js';

interface RecordedRun {
  readonly command: string;
  readonly args: readonly string[];
  readonly hasSignal: boolean;
}

function npmReturning(result: Partial<ProcessResult> | Error): {
  readonly runner: ProcessRunner;
  readonly runs: RecordedRun[];
} {
  const runs: RecordedRun[] = [];
  const runner: ProcessRunner = {
    run: (command, args, options) => {
      runs.push({ command, args, hasSignal: options?.signal !== undefined });
      return result instanceof Error
        ? Promise.reject(result)
        : Promise.resolve({ exitCode: 1, stdout: '', stderr: '', ...result });
    },
  };
  return { runner, runs };
}

const MANIFEST = [
  '{',
  '  "dependencies": {',
  '    "left-pad": "1.0.0",',
  '    "express": "4.0.0"',
  '  }',
  '}',
].join('\n');

const REPORT = JSON.stringify({
  auditReportVersion: 2,
  vulnerabilities: {
    express: {
      name: 'express',
      severity: 'high',
      isDirect: true,
      via: [{ title: 'Open  redirect\nin express' }, 'qs'],
      fixAvailable: { name: 'express', version: '4.19.2' },
    },
    qs: {
      name: 'qs',
      severity: 'moderate',
      isDirect: false,
      via: [{ title: 'Prototype pollution' }],
      fixAvailable: true,
    },
    'old-lib': { name: 'old-lib', severity: 'critical', via: [], fixAvailable: false },
  },
});

const CHECKOUT = { 'app/package.json': MANIFEST, 'app/package-lock.json': '{}' };

describe('dependenciesCheck', () => {
  it('is skipped, not passed, without a source checkout', async () => {
    const { outcome } = await runCodeCheck(dependenciesCheck, undefined);

    expect(outcome).toMatchObject({ status: 'skipped', findings: [] });
  });

  it('is skipped, not passed, and starts nothing when there is no npm lockfile', async () => {
    const { runner, runs } = npmReturning({ stdout: REPORT });

    const { outcome } = await runCodeCheck(
      dependenciesCheck,
      sourceFixture({ 'app/package.json': MANIFEST }, { processRunner: runner }),
    );

    expect(outcome.status).toBe('skipped');
    expect(outcome.note).toContain('package-lock.json');
    expect(runs).toEqual([]);
  });

  it('turns each vulnerable package into a finding with the severity, advisory, fix and file reference', async () => {
    const { runner } = npmReturning({ stdout: REPORT });

    const { outcome } = await runCodeCheck(
      dependenciesCheck,
      sourceFixture(CHECKOUT, { processRunner: runner }),
    );

    expect(outcome.findings.map((finding) => [finding.id, finding.severityProposal])).toEqual([
      ['dependencies-express', 'major'],
      ['dependencies-qs', 'minor'],
      ['dependencies-old-lib', 'critical'],
    ]);
    const [express, qs, oldLib] = outcome.findings;
    expect(express).toMatchObject({
      checkClass: 'dependencies',
      confidence: 'high',
      requestIndexes: [],
      remediation: 'Update express to 4.19.2 or later.',
      codeReferences: [{ path: 'app/package.json', line: 4 }],
    });
    expect(express?.actualResult).toBe(
      'express is reported as high (a direct dependency): Open redirect in express',
    );
    expect(qs?.remediation).toContain('patched version');
    expect(qs?.codeReferences).toEqual([{ path: 'app/package-lock.json' }]);
    expect(qs?.actualResult).toContain('pulled in by another dependency');
    expect(oldLib?.remediation).toContain('No fix is published');
    expect(oldLib?.actualResult).not.toContain(':');
  });

  it('passes with no finding when npm reports nothing', async () => {
    const { runner } = npmReturning({ exitCode: 0, stdout: JSON.stringify({ vulnerabilities: {} }) });

    const { outcome } = await runCodeCheck(
      dependenciesCheck,
      sourceFixture(CHECKOUT, { processRunner: runner }),
    );

    expect(outcome).toMatchObject({ status: 'passed', findings: [] });
  });

  it('audits the checkout directory by absolute path, with a timeout', async () => {
    const { runner, runs } = npmReturning({ stdout: REPORT });

    await runCodeCheck(dependenciesCheck, sourceFixture(CHECKOUT, { processRunner: runner }));

    expect(runs).toEqual([
      {
        command: 'npm',
        args: ['audit', '--json', '--prefix', join(FIXTURE_PROJECT_ROOT, 'app')],
        hasSignal: true,
      },
    ]);
  });

  it('audits only the checkout workspace when the lockfile sits above it', async () => {
    const { runner, runs } = npmReturning({ stdout: REPORT });

    await runCodeCheck(
      dependenciesCheck,
      sourceFixture(
        { 'packages/web/package.json': MANIFEST, 'package-lock.json': '{}' },
        { processRunner: runner, relativeRoot: 'packages/web' },
      ),
    );

    expect(runs[0]?.args).toEqual([
      'audit',
      '--json',
      '--prefix',
      FIXTURE_PROJECT_ROOT,
      '--workspace',
      'packages/web',
    ]);
  });

  it('uses an npm-shrinkwrap.json as the lockfile', async () => {
    const { runner, runs } = npmReturning({ stdout: REPORT });

    const { outcome } = await runCodeCheck(
      dependenciesCheck,
      sourceFixture({ 'app/npm-shrinkwrap.json': '{}' }, { processRunner: runner }),
    );

    expect(runs).toHaveLength(1);
    expect(outcome.findings.find((finding) => finding.id === 'dependencies-qs')?.codeReferences).toEqual([
      { path: 'app/npm-shrinkwrap.json' },
    ]);
  });

  it('cites the lockfile when the direct dependency is not found in the manifest', async () => {
    const { runner } = npmReturning({ stdout: REPORT });

    const { outcome } = await runCodeCheck(
      dependenciesCheck,
      sourceFixture({ 'app/package-lock.json': '{}' }, { processRunner: runner }),
    );

    expect(outcome.findings[0]?.codeReferences).toEqual([{ path: 'app/package-lock.json' }]);
  });

  it.each([
    [
      'npm reports an error',
      { stdout: JSON.stringify({ error: { code: 'ENOAUDIT', summary: 'registry unreachable' } }) },
      'registry unreachable',
    ],
    [
      'npm reports an error without a summary',
      { stdout: JSON.stringify({ error: { code: 'EAUDITNOLOCK' } }) },
      'EAUDITNOLOCK',
    ],
    ['npm reports an error with no detail', { stdout: JSON.stringify({ error: {} }) }, 'no reason given'],
    ['npm prints something that is not JSON', { stdout: 'npm ERR! offline' }, 'did not answer with JSON'],
    ['npm answers in an unknown shape', { stdout: JSON.stringify({ unexpected: true }) }, 'unknown shape'],
    ['npm cannot be started', new Error('spawn npm ENOENT'), 'could not be started'],
  ])('is blocked, never passed, when %s', async (_name, result, message) => {
    const { runner } = npmReturning(result);

    await expect(
      runCodeCheck(dependenciesCheck, sourceFixture(CHECKOUT, { processRunner: runner })),
    ).rejects.toMatchObject({
      code: 'SECURITY_DEPENDENCY_AUDIT_FAILED',
      message: expect.stringContaining(message) as string,
    });
  });
});
