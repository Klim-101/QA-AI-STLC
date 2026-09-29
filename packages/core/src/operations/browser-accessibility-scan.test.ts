// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BROWSER_TEST_CONFIG_YAML,
  createBrowserTestHarness,
} from '../test-support/browser-session-harness.js';
import { runBrowserAccessibilityScan } from './browser-accessibility-scan.js';
import { runBrowserNavigate } from './browser-navigate.js';
import { runBrowserOpen } from './browser-open.js';

describe('runBrowserAccessibilityScan', () => {
  it('injects axe-core, runs a scan and registers the raw result as evidence', async () => {
    const harness = createBrowserTestHarness({
      launcherOptions: { evaluateResult: { violations: [{ id: 'color-contrast' }, { id: 'label' }] } },
    });
    const { sessionId } = await runBrowserOpen(harness.context);
    await runBrowserNavigate(harness.context, { sessionId, url: 'https://staging.example.test/login' });

    const result = await runBrowserAccessibilityScan(harness.context, { sessionId });

    expect(result).toMatchObject({
      sessionId,
      url: 'https://staging.example.test/login',
      violationCount: 2,
    });
    expect(harness.launcher.pageCalls.some((call) => call.method === 'addScriptTag')).toBe(true);
    const written = JSON.parse(
      String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path))),
    ) as {
      violations: readonly unknown[];
    };
    expect(written.violations).toHaveLength(2);
  });

  it('records the axe-core version and a hash of the effective a11y config in the evidence', async () => {
    const harness = createBrowserTestHarness({ launcherOptions: { evaluateResult: { violations: [] } } });
    const { sessionId } = await runBrowserOpen(harness.context);

    const result = await runBrowserAccessibilityScan(harness.context, { sessionId });

    const written = JSON.parse(
      String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path))),
    ) as Record<string, unknown>;
    expect(result.axeVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(result.configHash).toMatch(/^[0-9a-f]{64}$/);
    expect(written).toMatchObject({
      axeVersion: result.axeVersion,
      configHash: result.configHash,
      wcagVersion: '2.1',
      level: 'AA',
      tags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    });
  });

  it('hashes a different effective config differently', async () => {
    const strict = createBrowserTestHarness({
      configYaml: `${BROWSER_TEST_CONFIG_YAML}a11y: { level: AAA }\n`,
    });
    const defaults = createBrowserTestHarness();
    const strictSession = await runBrowserOpen(strict.context);
    const defaultSession = await runBrowserOpen(defaults.context);

    const strictScan = await runBrowserAccessibilityScan(strict.context, {
      sessionId: strictSession.sessionId,
    });
    const defaultScan = await runBrowserAccessibilityScan(defaults.context, {
      sessionId: defaultSession.sessionId,
    });

    expect(strictScan.configHash).not.toBe(defaultScan.configHash);
  });

  it('separates excepted violations and surfaces incomplete results as uncertain', async () => {
    const harness = createBrowserTestHarness({
      configYaml: `${BROWSER_TEST_CONFIG_YAML}a11y: { exceptions: [{ ruleId: image-alt, reason: Legacy logo }] }\n`,
      launcherOptions: {
        evaluateResult: {
          violations: [{ id: 'image-alt' }, { id: 'label' }],
          incomplete: [{ id: 'color-contrast' }],
        },
      },
    });
    const { sessionId } = await runBrowserOpen(harness.context);

    const result = await runBrowserAccessibilityScan(harness.context, { sessionId });

    expect(result).toMatchObject({ violationCount: 1, exceptedCount: 1, uncertainCount: 1 });
    const written = JSON.parse(
      String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path))),
    ) as { excepted: { ruleId: string; reason: string }[]; uncertain: unknown[] };
    expect(written.excepted).toEqual([
      expect.objectContaining({ ruleId: 'image-alt', reason: 'Legacy logo' }),
    ]);
    expect(written.uncertain).toEqual([{ id: 'color-contrast' }]);
  });

  it('passes the level-derived tags and the include selectors to axe-core', async () => {
    const harness = createBrowserTestHarness({
      configYaml: `${BROWSER_TEST_CONFIG_YAML}a11y: { level: A, include: [main] }\n`,
      launcherOptions: { evaluateResult: { violations: [] } },
    });
    const { sessionId } = await runBrowserOpen(harness.context);

    await runBrowserAccessibilityScan(harness.context, { sessionId });

    const evaluateCall = harness.launcher.pageCalls.find((call) => call.method === 'evaluate');
    expect(evaluateCall?.args[1]).toMatchObject({
      context: { include: [['main']] },
      options: { runOnly: { type: 'tag', values: ['wcag2a', 'wcag21a'] } },
    });
  });

  it('reports zero violations when the scan result has none', async () => {
    const harness = createBrowserTestHarness({ launcherOptions: { evaluateResult: { violations: [] } } });
    const { sessionId } = await runBrowserOpen(harness.context);

    const result = await runBrowserAccessibilityScan(harness.context, { sessionId });

    expect(result.violationCount).toBe(0);
  });

  it('reports zero violations when the violations field is not an array', async () => {
    const harness = createBrowserTestHarness({ launcherOptions: { evaluateResult: { violations: 'oops' } } });
    const { sessionId } = await runBrowserOpen(harness.context);

    const result = await runBrowserAccessibilityScan(harness.context, { sessionId });

    expect(result.violationCount).toBe(0);
  });

  it('reports zero violations when the scan result has no violations field', async () => {
    const harness = createBrowserTestHarness({ launcherOptions: { evaluateResult: { unexpected: true } } });
    const { sessionId } = await runBrowserOpen(harness.context);

    const result = await runBrowserAccessibilityScan(harness.context, { sessionId });

    expect(result.violationCount).toBe(0);
  });

  it('reports zero violations when the scan result is not an object', async () => {
    const harness = createBrowserTestHarness({ launcherOptions: { evaluateResult: null } });
    const { sessionId } = await runBrowserOpen(harness.context);

    const result = await runBrowserAccessibilityScan(harness.context, { sessionId });

    expect(result.violationCount).toBe(0);
  });

  it('rejects an unknown session', async () => {
    const harness = createBrowserTestHarness();

    await expect(
      runBrowserAccessibilityScan(harness.context, { sessionId: 'session-gone' }),
    ).rejects.toMatchObject({ code: 'BROWSER_SESSION_NOT_FOUND' });
  });
});
