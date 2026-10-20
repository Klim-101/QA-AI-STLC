// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { createBrowserTestHarness } from '../test-support/browser-session-harness.js';
import { seedApprovedCase } from '../test-support/approved-case.js';
import { assertCaseApprovedForExecution } from './case-execution-approval.js';
import { runCasesAdd } from './cases-add.js';

const CASE_PATH = join('project', '.qa', 'artifacts', 'cases', 'login', 'login-valid-credentials.json');

describe('assertCaseApprovedForExecution', () => {
  it('accepts a case of an approved case set', async () => {
    const { context } = createBrowserTestHarness();
    const caseId = await seedApprovedCase(context.engine);

    await expect(assertCaseApprovedForExecution(context.engine, caseId)).resolves.toBeUndefined();
  });

  it('refuses a case whose case set the operator has not approved', async () => {
    const { context } = createBrowserTestHarness();
    const caseId = await seedApprovedCase(context.engine, { skipCasesApproval: true });

    await expect(assertCaseApprovedForExecution(context.engine, caseId)).rejects.toMatchObject({
      code: 'EXECUTION_CASE_NOT_APPROVED',
      message: expect.stringContaining('"cases" gate is not approved') as string,
    });
  });

  it('refuses a case id that no registered case has', async () => {
    const { context } = createBrowserTestHarness();
    await seedApprovedCase(context.engine);

    await expect(assertCaseApprovedForExecution(context.engine, 'nobody')).rejects.toMatchObject({
      code: 'CASE_NOT_FOUND',
    });
  });

  it('refuses a case added after the case set was approved', async () => {
    const { context } = createBrowserTestHarness();
    await seedApprovedCase(context.engine);
    await seedLaterCase(context.engine);

    await expect(assertCaseApprovedForExecution(context.engine, 'late-case')).rejects.toMatchObject({
      code: 'EXECUTION_CASE_NOT_APPROVED',
    });
  });

  it('refuses a case file edited after approval even though the approved snapshot was not regenerated', async () => {
    const { context } = createBrowserTestHarness();
    const caseId = await seedApprovedCase(context.engine);
    const original = await context.engine.fs.readFile(CASE_PATH);
    await context.engine.fs.writeFile(
      CASE_PATH,
      original.replace('Submit valid credentials', 'Do something else'),
    );

    await expect(assertCaseApprovedForExecution(context.engine, caseId)).rejects.toMatchObject({
      code: 'EXECUTION_CASE_NOT_APPROVED',
      message: expect.stringContaining('edited after') as string,
    });
  });

  it('refuses a case that the approved snapshot does not list', async () => {
    const { context } = createBrowserTestHarness();
    await seedApprovedCase(context.engine);
    const strayPath = join('project', '.qa', 'artifacts', 'cases', 'login', 'stray-case.json');
    await context.engine.fs.writeFile(strayPath, await context.engine.fs.readFile(CASE_PATH));

    await expect(assertCaseApprovedForExecution(context.engine, 'stray-case')).rejects.toMatchObject({
      code: 'EXECUTION_CASE_NOT_APPROVED',
      message: expect.stringContaining('not in the approved case set') as string,
    });
  });
});

async function seedLaterCase(engine: EngineContext): Promise<void> {
  await runCasesAdd(engine, {
    testCase: {
      id: 'late-case',
      feature: 'login',
      requirementIds: ['r1'],
      testType: 'e2e',
      title: 'A case added late',
      steps: [{ description: 'Do something' }],
      expectedResult: 'Something happens',
      status: 'draft',
      createdAt: '2026-09-20T12:00:00Z',
    },
  });
}
