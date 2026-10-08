// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { A11yScanRecordSchema, type RunResult } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { finalizeA11yOutcome, prepareA11yRun } from './a11y-run.js';
import { axeResult } from './test-support/axe-result.js';
import {
  A11Y_SCAN_ATTACHMENT_CONTENT_TYPE,
  A11Y_SCAN_ENVIRONMENT_VARIABLE,
  A11Y_SCAN_MODULE_PATH,
} from './a11y-scan-module.js';
import type { EngineContext } from './engine-context.js';
import type { RunnerOutcome } from './runner.js';

function engineWith(a11yYaml: string): EngineContext {
  return {
    projectRoot: 'project',
    fs: createFakeFileSystem({
      [join('project', '.qa', 'config.yaml')]: [
        'schemaVersion: 1',
        'testing: { e2e: undecided, api: out-of-scope, a11y: in-scope, security: undecided }',
        'environments:\n  staging: { baseUrl: "https://staging.example.com", allowlist: ["staging.example.com"] }',
        'identities: {}',
        'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
        'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
        'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
        `a11y: ${a11yYaml}`,
        '',
      ].join('\n'),
    }),
    clock: { now: () => new Date('2026-10-06T12:00:00Z') },
    logger: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeBrowserLauncher(),
    env: {},
  };
}

const TODAY = '2026-10-06';

function resultWith(status: RunResult['status'], failure?: string): RunResult {
  return {
    schemaVersion: 1,
    id: 'run-result-1',
    runId: 'run-1',
    testCaseId: 'case-1',
    testType: 'a11y',
    status,
    startedAt: '2026-10-06T12:00:00.000Z',
    finishedAt: '2026-10-06T12:00:01.000Z',
    evidenceIds: [],
    ...(failure === undefined ? {} : { failure: { message: failure } }),
  };
}

function scan(partial: { violations?: string[]; incomplete?: string[]; tags?: readonly string[] }): string {
  const entries = (ids: string[] | undefined): { id: string }[] => (ids ?? []).map((id) => ({ id }));
  return JSON.stringify(
    axeResult({
      violations: entries(partial.violations),
      incomplete: entries(partial.incomplete),
      passes: [{ id: 'html-has-lang' }],
      ...(partial.tags === undefined ? {} : { tags: partial.tags }),
    }),
  );
}

describe('prepareA11yRun', () => {
  it('derives the scan plan from configuration, writes the helper and hashes the configuration', async () => {
    const engine = engineWith('{ level: A }');

    const preparation = await prepareA11yRun(engine);

    const plan = JSON.parse(preparation.environment[A11Y_SCAN_ENVIRONMENT_VARIABLE] ?? '') as {
      options: { runOnly: { values: string[] } };
    };
    expect(plan.options.runOnly.values).toEqual(['wcag2a', 'wcag21a']);
    expect(preparation.evidenceKindsByContentType).toEqual({ [A11Y_SCAN_ATTACHMENT_CONTENT_TYPE]: 'other' });
    expect(preparation.configHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(await engine.fs.pathExists(join('project', ...A11Y_SCAN_MODULE_PATH.split('/')))).toBe(true);
  });
});

describe('finalizeA11yOutcome', () => {
  async function finalize(outcome: RunnerOutcome, a11yYaml = '{}'): Promise<RunnerOutcome> {
    return finalizeA11yOutcome(outcome, await prepareA11yRun(engineWith(a11yYaml)), TODAY);
  }

  function parseRecord(outcome: RunnerOutcome, index = 0): ReturnType<typeof A11yScanRecordSchema.parse> {
    return A11yScanRecordSchema.parse(JSON.parse(String(outcome.evidence[index]?.content)));
  }

  it('fails a passed test whose scan has violations and names the violated rules once, in order', async () => {
    const outcome = await finalize({
      result: resultWith('passed'),
      evidence: [
        { kind: 'other', content: scan({ violations: ['image-alt', 'color-contrast'] }) },
        { kind: 'other', content: Buffer.from(scan({ violations: ['color-contrast'] })) },
      ],
    });

    expect(outcome.result.status).toBe('failed');
    expect(outcome.result.failure?.message).toBe(
      '2 accessibility rules violated (WCAG 2.1 AA): color-contrast, image-alt.',
    );
    expect(parseRecord(outcome).violations.map((violation) => violation.id)).toEqual([
      'image-alt',
      'color-contrast',
    ]);
  });

  it('names a single violated rule in the singular', async () => {
    const outcome = await finalize({
      result: resultWith('passed'),
      evidence: [{ kind: 'other', content: scan({ violations: ['image-alt'] }) }],
    });

    expect(outcome.result.failure?.message).toBe('1 accessibility rule violated (WCAG 2.1 AA): image-alt.');
  });

  it('reports a scan with only incomplete results as uncertain, never passed', async () => {
    const outcome = await finalize({
      result: resultWith('passed'),
      evidence: [{ kind: 'other', content: scan({ incomplete: ['color-contrast'] }) }],
    });

    expect(outcome.result.status).toBe('uncertain');
    expect(outcome.result.failure).toBeUndefined();
    expect(parseRecord(outcome).uncertain).toHaveLength(1);
  });

  it('passes a clean scan and keeps non-scan evidence untouched', async () => {
    const screenshot = { kind: 'screenshot', content: new Uint8Array([1]) } as const;
    const outcome = await finalize({
      result: resultWith('passed'),
      evidence: [screenshot, { kind: 'other', content: scan({}) }],
    });

    expect(outcome.result.status).toBe('passed');
    expect(outcome.evidence[0]).toBe(screenshot);
    expect(parseRecord(outcome, 1).passedRuleIds).toEqual(['html-has-lang']);
  });

  it('does not fail a case whose only violation an active exception covers', async () => {
    const outcome = await finalize(
      {
        result: resultWith('passed'),
        evidence: [{ kind: 'other', content: scan({ violations: ['image-alt'] }) }],
      },
      '{ exceptions: [{ ruleId: image-alt, reason: "Decorative" }] }',
    );

    expect(outcome.result.status).toBe('passed');
    expect(parseRecord(outcome).excepted.map((entry) => entry.ruleId)).toEqual(['image-alt']);
  });

  it.each(['failed', 'blocked', 'skipped'] as const)(
    'keeps a %s status from Playwright even when the scan was clean',
    async (status) => {
      const failure = status === 'failed' ? 'navigation failed' : undefined;
      const outcome = await finalize({
        result: resultWith(status, failure),
        evidence: [{ kind: 'other', content: scan({}) }],
      });

      expect(outcome.result).toEqual(resultWith(status, failure));
      expect(parseRecord(outcome).type).toBe('a11y-scan');
    },
  );

  it('rejects a passed test that never scanned a page', async () => {
    await expect(finalize({ result: resultWith('passed'), evidence: [] })).rejects.toMatchObject({
      code: 'RUNNER_A11Y_NO_SCAN',
    });
  });

  it('rejects an attached result that is not JSON', async () => {
    await expect(
      finalize({ result: resultWith('passed'), evidence: [{ kind: 'other', content: 'not json' }] }),
    ).rejects.toMatchObject({ code: 'RUNNER_A11Y_RESULT_INVALID' });
  });

  it.each(['{}', 'null', '[]', '{"violations":[],"incomplete":[],"passes":[],"inapplicable":[]}'])(
    'rejects an attachment that is not a complete axe-core result (%s) instead of passing the case',
    async (content) => {
      await expect(
        finalize({ result: resultWith('passed'), evidence: [{ kind: 'other', content }] }),
      ).rejects.toMatchObject({ code: 'A11Y_SCAN_RESULT_INVALID' });
    },
  );

  it('rejects a result scanned under another accessibility target than the configured one', async () => {
    await expect(
      finalize({
        result: resultWith('passed'),
        evidence: [{ kind: 'other', content: scan({ tags: ['wcag2a'] }) }],
      }),
    ).rejects.toMatchObject({ code: 'A11Y_SCAN_CONFIG_MISMATCH' });
  });
});
