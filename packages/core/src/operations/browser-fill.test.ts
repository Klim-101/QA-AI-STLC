// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BROWSER_TEST_CONFIG_YAML,
  createBrowserTestHarness,
} from '../test-support/browser-session-harness.js';
import { runBrowserFill } from './browser-fill.js';
import { runBrowserOpen } from './browser-open.js';

describe('runBrowserFill', () => {
  it('waits for busy indicators to clear before and after the fill (P6-42)', async () => {
    const harness = createBrowserTestHarness({
      configYaml: `${BROWSER_TEST_CONFIG_YAML}ui: { busySelectors: [".mask"] }
`,
      launcherOptions: { evaluateResult: null },
    });
    const { sessionId } = await runBrowserOpen(harness.context);

    await runBrowserFill(harness.context, { sessionId, selector: '#name', value: 'x' });

    expect(
      harness.launcher.pageCalls
        .map((call) => call.method)
        .filter((method) => method === 'evaluate' || method === 'fill'),
    ).toEqual(['evaluate', 'fill', 'evaluate']);
  });

  it('types into the field and records only how much was typed', async () => {
    const harness = createBrowserTestHarness();
    const { sessionId } = await runBrowserOpen(harness.context);

    const result = await runBrowserFill(harness.context, {
      sessionId,
      selector: '#password',
      value: 'hunter2-not-in-evidence',
    });

    expect(harness.launcher.pageCalls.filter((call) => call.method === 'fill')).toEqual([
      { method: 'fill', args: ['#password', 'hunter2-not-in-evidence', { timeout: 30_000 }] },
    ]);
    expect(result.valueLength).toBe('hunter2-not-in-evidence'.length);

    const written = String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path)));
    expect(written).not.toContain('hunter2-not-in-evidence');
    expect(JSON.parse(written)).toEqual({
      schemaVersion: 1,
      type: 'fill',
      sessionId,
      selector: '#password',
      valueLength: 23,
      url: 'about:blank',
      at: '2026-09-21T10:00:00.000Z',
    });
  });

  it('carries a stepId into the recorded evidence, for qa-generate-tests (P3-07) to recover later', async () => {
    const harness = createBrowserTestHarness();
    const { sessionId } = await runBrowserOpen(harness.context);

    const result = await runBrowserFill(harness.context, {
      sessionId,
      selector: '#password',
      value: 'hunter2',
      stepId: 'step-1',
    });

    const written = JSON.parse(
      String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path))),
    ) as { stepId?: string };
    expect(written.stepId).toBe('step-1');
  });

  it('rejects an unknown session', async () => {
    const harness = createBrowserTestHarness();

    await expect(
      runBrowserFill(harness.context, { sessionId: 'session-gone', selector: '#q', value: 'x' }),
    ).rejects.toMatchObject({ code: 'BROWSER_SESSION_NOT_FOUND' });
  });

  describe('valueFromEnv (P6-75)', () => {
    function withEnv(env: Record<string, string>) {
      const harness = createBrowserTestHarness();
      const context = { ...harness.context, engine: { ...harness.context.engine, env } };
      return { harness, context };
    }

    it('types the variable value and keeps it out of the result and the evidence', async () => {
      const { harness, context } = withEnv({ QA_STAGE_PASSWORD: 'env-secret-value' });
      const { sessionId } = await runBrowserOpen(context);

      const result = await runBrowserFill(context, {
        sessionId,
        selector: '#password',
        valueFromEnv: 'QA_STAGE_PASSWORD',
      });

      expect(harness.launcher.pageCalls.filter((call) => call.method === 'fill')).toEqual([
        { method: 'fill', args: ['#password', 'env-secret-value', { timeout: 30_000 }] },
      ]);
      expect(result.valueLength).toBe('env-secret-value'.length);
      expect(JSON.stringify(result)).not.toContain('env-secret-value');
      const written = String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path)));
      expect(written).not.toContain('env-secret-value');
    });

    it('rejects a name without the QA_ prefix, without reading the variable', async () => {
      const { context } = withEnv({ HOME: '/home/someone' });
      const { sessionId } = await runBrowserOpen(context);

      await expect(
        runBrowserFill(context, { sessionId, selector: '#password', valueFromEnv: 'HOME' }),
      ).rejects.toMatchObject({ code: 'BROWSER_FILL_ENV_NAME_INVALID' });
    });

    it.each([{ QA_STAGE_PASSWORD: '' }, {}])('rejects an unset or empty variable (%j)', async (env) => {
      const { context } = withEnv(env);
      const { sessionId } = await runBrowserOpen(context);

      await expect(
        runBrowserFill(context, { sessionId, selector: '#password', valueFromEnv: 'QA_STAGE_PASSWORD' }),
      ).rejects.toMatchObject({ code: 'BROWSER_FILL_ENV_UNSET' });
    });

    it.each([{ value: 'x', valueFromEnv: 'QA_STAGE_PASSWORD' }, {}])(
      'requires exactly one of value and valueFromEnv (%j)',
      async (given) => {
        const { context } = withEnv({ QA_STAGE_PASSWORD: 'p' });
        const { sessionId } = await runBrowserOpen(context);

        await expect(
          runBrowserFill(context, { sessionId, selector: '#password', ...given }),
        ).rejects.toMatchObject({ code: 'BROWSER_FILL_VALUE_AMBIGUOUS' });
      },
    );
  });
});
