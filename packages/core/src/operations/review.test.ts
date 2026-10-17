// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { hashText } from '../hash.js';
import { toCanonicalJson } from '../json-file.js';
import { ManifestStore } from '../manifest-store.js';
import { QaStore } from '../qa-store.js';
import { createFakeEngineContext } from '../test-support/fake-engine-context.js';
import { runReviewAdd } from './review-add.js';
import { runReviewInput } from './review-input.js';

const SPEC_PATH = 'tests/qa/generated/login.spec.ts';

const LOCATOR_MODULE = [
  "import type { Page, Locator } from '@playwright/test';",
  '// elements: el-1',
  'export function loginButton(page: Page): Locator {',
  "  return page.getByRole('button', { name: 'Log in' });",
  '}',
  '',
].join('\n');

function specWith(...assertions: readonly string[]): string {
  return [
    "import { expect, test } from '@playwright/test';",
    "import { loginButton } from '../locators.js';",
    '',
    "test('login', { annotation: { type: 'testCaseId', description: 'login' } }, async ({ page }) => {",
    "  await test.step('[step-1] Open the login page', async () => {",
    "    await page.goto('/login');",
    ...assertions.map((assertion) => `    ${assertion}`),
    '  });',
    '});',
    '',
  ].join('\n');
}

const GOOD_SPEC = specWith('await expect(loginButton(page)).toBeVisible();');

interface ProjectOptions {
  readonly spec?: string;
  readonly isRegistered?: boolean;
  readonly hasLocatorModule?: boolean;
  readonly hasProvenSession?: boolean;
  readonly hasVerification?: boolean;
}

async function project(options: ProjectOptions = {}): Promise<EngineContext> {
  const fs = createFakeFileSystem({
    [join('project', '.qa', 'config.yaml')]: [
      'schemaVersion: 1',
      'testing: { e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
      'environments:',
      '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
      'identities: {}',
      'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
      'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
      'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
      '',
    ].join('\n'),
  });
  const context = createFakeEngineContext({ fs });
  const store = new QaStore({ projectRoot: 'project', fs });
  const manifest = new ManifestStore({ store });
  await store.writeText(
    'artifacts/cases/auth/login.json',
    toCanonicalJson({
      id: 'login',
      feature: 'auth',
      requirementIds: ['req-login'],
      testType: 'e2e',
      title: 'A user can log in',
      steps: [{ description: 'Open the login page' }],
      expectedResult: 'The log in button is shown',
      status: 'approved',
      createdAt: '2026-10-01T09:00:00Z',
    }),
  );
  const spec = options.spec ?? GOOD_SPEC;
  await fs.writeFile(join('project', ...SPEC_PATH.split('/')), spec);
  if (options.isRegistered !== false) {
    await manifest.register(SPEC_PATH, spec, { root: 'project' });
  }
  if (options.hasLocatorModule !== false) {
    await fs.writeFile(join('project', 'tests', 'qa', 'locators.ts'), LOCATOR_MODULE);
  }
  if (options.hasProvenSession === true) {
    await store.writeJson('runs/login/passed.json', {
      schemaVersion: 1,
      id: 'passed',
      runId: 'run-x',
      testCaseId: 'login',
      testType: 'e2e',
      status: 'passed',
      startedAt: '2026-10-02T10:00:00Z',
      finishedAt: '2026-10-02T10:00:01Z',
      evidenceIds: ['ev1'],
    });
    await store.writeJson('evidence/run-x/ev1.json', {
      schemaVersion: 1,
      type: 'navigate',
      sessionId: 's1',
      stepId: 'step-1',
      url: 'https://staging.example.test/welcome-back-page',
      at: '2026-10-02T10:00:00Z',
    });
  }
  if (options.hasVerification !== false) {
    await store.writeJson('verifications/verification-1.json', {
      schemaVersion: 1,
      id: 'verification-1',
      testCaseId: 'login',
      filePath: SPEC_PATH,
      contentSha256: hashText(spec),
      status: 'verified',
      result: {
        schemaVersion: 1,
        id: 'r',
        runId: 'run-v',
        testCaseId: 'login',
        testType: 'e2e',
        status: 'passed',
        startedAt: '2026-10-03T10:00:00Z',
        finishedAt: '2026-10-03T10:00:01Z',
        evidenceIds: [],
      },
      verifiedAt: '2026-10-03T10:00:02Z',
      consumedAt: '2026-10-03T10:00:03Z',
    });
  }
  return context;
}

function reviewOf(
  context: EngineContext,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  return runReviewInput(context, { testCaseId: 'login', specPath: SPEC_PATH }).then((input) => ({
    schemaVersion: 1,
    testCaseId: 'login',
    specPath: SPEC_PATH,
    specSha256: input.specSha256,
    verdict: 'approved',
    reasons: ['It checks what the case says.'],
    waivers: [],
    createdAt: '2026-10-17T09:00:00Z',
    ...overrides,
  }));
}

describe('runReviewInput', () => {
  it('gives the case, the spec as registered, its verification and what the engine found', async () => {
    const context = await project({ hasProvenSession: true });

    const input = await runReviewInput(context, { testCaseId: 'login', specPath: SPEC_PATH });

    expect(input).toMatchObject({
      testCaseId: 'login',
      specPath: SPEC_PATH,
      case: {
        title: 'A user can log in',
        steps: ['Open the login page'],
        expectedResult: 'The log in button is shown',
      },
      isSpecTruncated: false,
      hasProvenSession: true,
      verification: { id: 'verification-1', status: 'verified', resultStatus: 'passed' },
    });
    expect(input.specContent).toBe(GOOD_SPEC);
    expect(input.specSha256).toBe(hashText(GOOD_SPEC));
    expect(input.assertions).toMatchObject([
      { id: 'a1', stepId: 'step-1', subject: { kind: 'locator', name: 'loginButton' }, findings: [] },
    ]);
  });

  it('flags a fabricated assertion that a run of the spec would pass', async () => {
    const context = await project({
      spec: specWith(
        'await expect(loginButton(page)).toBeVisible();',
        'expect(true).toBe(true);',
        "await expect(page).toHaveTitle('Welcome back, order #4242 confirmed');",
      ),
    });

    const input = await runReviewInput(context, { testCaseId: 'login', specPath: SPEC_PATH });

    expect(input.hasProvenSession).toBe(false);
    expect(input.assertions.map((assertion) => assertion.findings.map((finding) => finding.code))).toEqual([
      [],
      ['tautology'],
      ['ungrounded-value'],
    ]);
  });

  it('grounds a value in what the proven session saw', async () => {
    const context = await project({
      hasProvenSession: true,
      spec: specWith('await expect(page).toHaveURL(/welcome-back-page/);'),
    });

    expect(
      (await runReviewInput(context, { testCaseId: 'login', specPath: SPEC_PATH })).assertions[0]?.findings,
    ).toEqual([]);
  });

  it('checks locators against nothing when the project has no locator module', async () => {
    const context = await project({
      hasLocatorModule: false,
      spec: specWith('await expect(ghost(page)).toBeVisible();'),
    });

    expect(
      (await runReviewInput(context, { testCaseId: 'login', specPath: SPEC_PATH })).assertions[0]?.findings,
    ).toEqual([]);
  });

  it('leaves out the verification when the engine holds none, and the result when it never ran', async () => {
    const without = await project({ hasVerification: false });
    const never = await project();
    await never.fs.writeFile(
      join('project', '.qa', 'verifications', 'verification-1.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: 'verification-1',
        testCaseId: 'login',
        filePath: SPEC_PATH,
        contentSha256: hashText(GOOD_SPEC),
        status: 'verified',
        verifiedAt: '2026-10-03T10:00:02Z',
        consumedAt: '2026-10-03T10:00:03Z',
      }),
    );

    expect(await runReviewInput(without, { testCaseId: 'login', specPath: SPEC_PATH })).not.toHaveProperty(
      'verification',
    );
    expect((await runReviewInput(never, { testCaseId: 'login', specPath: SPEC_PATH })).verification).toEqual({
      id: 'verification-1',
      status: 'verified',
    });
  });

  it('takes the latest verification of the exact content, and ignores one never used to register it', async () => {
    const context = await project();
    const record = (id: string, verifiedAt: string, consumedAt?: string) =>
      JSON.stringify({
        schemaVersion: 1,
        id,
        testCaseId: 'login',
        filePath: SPEC_PATH,
        contentSha256: hashText(GOOD_SPEC),
        status: 'verified',
        verifiedAt,
        ...(consumedAt === undefined ? {} : { consumedAt }),
      });
    await context.fs.writeFile(
      join('project', '.qa', 'verifications', 'verification-2.json'),
      record('verification-2', '2026-10-05T10:00:00Z', '2026-10-05T10:00:01Z'),
    );
    await context.fs.writeFile(
      join('project', '.qa', 'verifications', 'verification-3.json'),
      record('verification-3', '2026-10-06T10:00:00Z'),
    );

    expect(
      (await runReviewInput(context, { testCaseId: 'login', specPath: SPEC_PATH })).verification?.id,
    ).toBe('verification-2');
  });

  it('caps a very long spec and says so', async () => {
    const long = `${GOOD_SPEC}\n// ${'x'.repeat(31_000)}\n`;
    const context = await project({ spec: long });

    const input = await runReviewInput(context, { testCaseId: 'login', specPath: SPEC_PATH });

    expect(input.isSpecTruncated).toBe(true);
    expect(input.specContent).toHaveLength(30_000);
  });

  it('refuses a spec that is missing, not registered, edited since, or of another case', async () => {
    const missing = await project();
    await missing.fs.deleteFile(join('project', ...SPEC_PATH.split('/')));
    const unregistered = await project({ isRegistered: false });
    const edited = await project();
    await edited.fs.writeFile(join('project', ...SPEC_PATH.split('/')), `${GOOD_SPEC}// edited`);
    const other = await project({
      spec: GOOD_SPEC.replace("description: 'login'", "description: 'checkout'"),
    });

    await expect(runReviewInput(missing, { testCaseId: 'login', specPath: SPEC_PATH })).rejects.toMatchObject(
      {
        code: 'REVIEW_SPEC_NOT_FOUND',
      },
    );
    await expect(
      runReviewInput(unregistered, { testCaseId: 'login', specPath: SPEC_PATH }),
    ).rejects.toMatchObject({
      code: 'REVIEW_SPEC_NOT_REGISTERED',
    });
    await expect(runReviewInput(edited, { testCaseId: 'login', specPath: SPEC_PATH })).rejects.toMatchObject({
      code: 'REVIEW_SPEC_NOT_REGISTERED',
    });
    await expect(runReviewInput(other, { testCaseId: 'login', specPath: SPEC_PATH })).rejects.toMatchObject({
      code: 'REVIEW_SPEC_CASE_MISMATCH',
    });
  });

  it('refuses a missing case id or spec path, and a case that is not registered', async () => {
    const context = await project();

    await expect(runReviewInput(context, { specPath: SPEC_PATH })).rejects.toMatchObject({
      code: 'REVIEW_INPUT_USAGE',
    });
    await expect(runReviewInput(context, { testCaseId: 'login' })).rejects.toMatchObject({
      code: 'REVIEW_INPUT_USAGE',
    });
    await expect(runReviewInput(context, { testCaseId: 'nope', specPath: SPEC_PATH })).rejects.toMatchObject({
      code: 'CASE_NOT_FOUND',
    });
  });
});

describe('runReviewAdd', () => {
  it('registers an approval of a spec with nothing found', async () => {
    const context = await project();

    const result = await runReviewAdd(context, { review: await reviewOf(context) });

    expect(result).toEqual({
      testCaseId: 'login',
      verdict: 'approved',
      reviewPath: 'artifacts/reviews/login.json',
    });
    expect(await context.fs.readFile(join('project', '.qa', 'artifacts', 'reviews', 'login.json'))).toContain(
      'approved',
    );
  });

  it('rejects, and so records, a spec with a fabricated assertion that a run would pass', async () => {
    const context = await project({
      spec: specWith('await expect(loginButton(page)).toBeVisible();', 'expect(true).toBe(true);'),
    });

    const approval = await runReviewAdd(context, { review: await reviewOf(context) }).catch(
      (caught: unknown) => caught,
    );
    const rejection = await runReviewAdd(context, {
      review: await reviewOf(context, {
        verdict: 'rejected',
        reasons: ['a2 asserts a literal, not the application.'],
      }),
    });

    expect(approval).toMatchObject({ code: 'REVIEW_APPROVAL_BLOCKED' });
    expect(rejection.verdict).toBe('rejected');
  });

  it('does not let a waiver clear an error finding', async () => {
    const context = await project({ spec: specWith('expect(1).toBe(1);') });

    await expect(
      runReviewAdd(context, {
        review: await reviewOf(context, {
          waivers: [{ assertionId: 'a1', code: 'tautology', reason: 'It is fine.' }],
        }),
      }),
    ).rejects.toMatchObject({ code: 'REVIEW_APPROVAL_BLOCKED' });
  });

  it('wants a reason for every warning before it approves, and accepts one given', async () => {
    const context = await project({
      spec: specWith("await expect(page).toHaveTitle('Some heading nobody mentioned');"),
    });

    const unwaived = await runReviewAdd(context, { review: await reviewOf(context) }).catch(
      (caught: unknown) => caught,
    );
    const waived = await runReviewAdd(context, {
      review: await reviewOf(context, {
        waivers: [
          {
            assertionId: 'a1',
            code: 'ungrounded-value',
            reason: 'The heading is checked by hand against the design.',
          },
        ],
      }),
    });

    expect(unwaived).toMatchObject({ code: 'REVIEW_WARNING_NOT_WAIVED' });
    expect(waived.verdict).toBe('approved');
  });

  it('refuses a waiver for a finding the engine does not raise', async () => {
    const context = await project();

    await expect(
      runReviewAdd(context, {
        review: await reviewOf(context, {
          waivers: [{ assertionId: 'a1', code: 'tautology', reason: 'Made up.' }],
        }),
      }),
    ).rejects.toMatchObject({ code: 'REVIEW_WAIVER_UNKNOWN' });
  });

  it('refuses a review of another version of the spec than the registered one', async () => {
    const context = await project();

    await expect(
      runReviewAdd(context, { review: await reviewOf(context, { specSha256: 'a'.repeat(64) }) }),
    ).rejects.toMatchObject({ code: 'REVIEW_SPEC_CHANGED' });
  });

  it('replaces the earlier review of the case', async () => {
    const context = await project();
    await runReviewAdd(context, { review: await reviewOf(context) });

    await runReviewAdd(context, {
      review: await reviewOf(context, { verdict: 'rejected', reasons: ['Changed my mind.'] }),
    });

    expect(await context.fs.readFile(join('project', '.qa', 'artifacts', 'reviews', 'login.json'))).toContain(
      'rejected',
    );
  });

  it('reads the review from a file', async () => {
    const context = await project();
    await context.fs.writeFile(join('project', 'review.json'), JSON.stringify(await reviewOf(context)));

    expect((await runReviewAdd(context, { path: 'review.json' })).verdict).toBe('approved');
  });

  it('refuses a review given both ways, neither way, from a missing file or that does not match its schema', async () => {
    const context = await project();
    const review = await reviewOf(context);

    await expect(runReviewAdd(context, { path: 'a.json', review })).rejects.toMatchObject({
      code: 'REVIEW_ADD_USAGE',
    });
    await expect(runReviewAdd(context, {})).rejects.toMatchObject({ code: 'REVIEW_ADD_USAGE' });
    await expect(runReviewAdd(context, { path: 'missing.json' })).rejects.toMatchObject({
      code: 'REVIEW_ADD_FILE_NOT_FOUND',
    });
    await expect(runReviewAdd(context, { review: { ...review, verdict: 'maybe' } })).rejects.toMatchObject({
      code: 'REVIEW_INVALID',
    });
    await expect(
      runReviewAdd(context, { review: { ...review, testCaseId: '../escape' } }),
    ).rejects.toMatchObject({
      code: 'REVIEW_INVALID',
    });
  });
});
