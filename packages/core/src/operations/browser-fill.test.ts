// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBrowserTestHarness } from '../test-support/browser-session-harness.js';
import { runBrowserFill } from './browser-fill.js';
import { runBrowserOpen } from './browser-open.js';

describe('runBrowserFill', () => {
  it('types into the field and records only how much was typed', async () => {
    const harness = createBrowserTestHarness();
    const { sessionId } = await runBrowserOpen(harness.context);

    const result = await runBrowserFill(harness.context, {
      sessionId,
      selector: '#password',
      value: 'hunter2-not-in-evidence',
    });

    expect(harness.launcher.pageCalls.filter((call) => call.method === 'fill')).toEqual([
      { method: 'fill', args: ['#password', 'hunter2-not-in-evidence'] },
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
});
