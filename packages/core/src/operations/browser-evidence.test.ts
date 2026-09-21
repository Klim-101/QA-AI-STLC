// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBrowserTestHarness } from '../test-support/browser-session-harness.js';
import {
  createBrowserEvidenceStore,
  registerBrowserAction,
  registerEvidenceOrThrow,
} from './browser-evidence.js';
import { runBrowserOpen } from './browser-open.js';

describe('registerEvidenceOrThrow', () => {
  it('returns the registered record for clean content', async () => {
    const harness = createBrowserTestHarness();
    const evidenceStore = createBrowserEvidenceStore(harness.context.engine);

    const evidence = await registerEvidenceOrThrow(evidenceStore, {
      id: 'evidence-1',
      runId: 'run-1',
      kind: 'console-log',
      content: 'nothing sensitive here',
    });

    expect(evidence.path).toBe('evidence/run-1/evidence-1.log');
  });

  it('throws BROWSER_EVIDENCE_QUARANTINED naming the receipt, not the value', async () => {
    const harness = createBrowserTestHarness();
    const evidenceStore = createBrowserEvidenceStore(harness.context.engine);

    try {
      await registerEvidenceOrThrow(evidenceStore, {
        id: 'evidence-1',
        runId: 'run-1',
        kind: 'console-log',
        content: 'AKIAIOSFODNN7EXAMPLE',
      });
      expect.unreachable('expected quarantined evidence to throw');
    } catch (error) {
      expect(error).toMatchObject({ code: 'BROWSER_EVIDENCE_QUARANTINED' });
      const { message, remediation } = error as { message: string; remediation: string };
      expect(message).toContain('aws-access-key-id');
      expect(message).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(remediation).toContain('evidence/run-1/evidence-1.quarantine.json');
    }
  });
});

describe('registerBrowserAction', () => {
  it('files the record under the session run with an action kind', async () => {
    const harness = createBrowserTestHarness();
    await runBrowserOpen(harness.context);
    const session = await harness.sessions.get('session-1-1');
    const evidenceStore = createBrowserEvidenceStore(harness.context.engine);

    const evidence = await registerBrowserAction({
      evidenceStore,
      evidenceId: 'evidence-manual',
      session,
      now: new Date('2026-09-21T11:00:00.000Z'),
      action: { type: 'navigate', url: 'https://staging.example.test/' },
    });

    expect(evidence).toMatchObject({
      kind: 'action',
      runId: 'run-1-2',
      path: 'evidence/run-1-2/evidence-manual.json',
      createdAt: '2026-09-21T10:00:00.000Z',
    });
  });

  it('omits every optional field for an action that has none', async () => {
    const harness = createBrowserTestHarness();
    await runBrowserOpen(harness.context);
    const session = await harness.sessions.get('session-1-1');
    const evidenceStore = createBrowserEvidenceStore(harness.context.engine);

    const evidence = await registerBrowserAction({
      evidenceStore,
      evidenceId: 'evidence-bare',
      session,
      now: new Date('2026-09-21T10:00:00.000Z'),
      action: { type: 'close' },
    });

    expect(JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', evidence.path))))).toEqual({
      schemaVersion: 1,
      type: 'close',
      sessionId: 'session-1-1',
      at: '2026-09-21T10:00:00.000Z',
    });
  });
});
