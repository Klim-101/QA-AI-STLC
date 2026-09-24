// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBrowserTestHarness } from '../test-support/browser-session-harness.js';
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
