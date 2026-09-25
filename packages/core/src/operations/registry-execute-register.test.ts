// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import type { SelectorRegistry } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { createBrowserTestHarness } from '../test-support/browser-session-harness.js';
import { runBrowserNavigate } from './browser-navigate.js';
import { runBrowserOpen } from './browser-open.js';
import { runRegisterExecutedElement } from './registry-execute-register.js';

const REGISTRY_FILE_PATH = join('project', '.qa', 'selectors', 'registry.json');

describe('runRegisterExecutedElement', () => {
  it('registers a new execute-sourced element after re-verifying the selector is unique', async () => {
    const harness = createBrowserTestHarness();
    const { sessionId } = await runBrowserOpen(harness.context);
    await runBrowserNavigate(harness.context, { sessionId, url: 'https://staging.example.test/login' });

    const result = await runRegisterExecutedElement(harness.context, {
      sessionId,
      selector: 'role=button[name="Log in"]',
      kind: 'button',
      name: 'Log in',
    });

    expect(result.created).toBe(true);
    const registry = JSON.parse(String(harness.fs.getRawFile(REGISTRY_FILE_PATH))) as SelectorRegistry;
    expect(registry.elements).toEqual([
      {
        elementId: result.elementId,
        kind: 'button',
        name: 'Log in',
        locatorCandidates: [{ strategy: 'execute', value: 'role=button[name="Log in"]', fragile: true }],
        stabilityScore: 1,
        lastVerifiedAt: '2026-09-21T10:00:00.000Z',
        source: 'execute',
        pageUrl: 'https://staging.example.test/login',
      },
    ]);
  });

  it('registers the updated registry in the manifest', async () => {
    const harness = createBrowserTestHarness();
    const { sessionId } = await runBrowserOpen(harness.context);

    await runRegisterExecutedElement(harness.context, { sessionId, selector: 'text=Log in', kind: 'button' });

    const manifest = JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', 'manifest.json')))) as {
      artifacts: Record<string, unknown>;
    };
    expect(manifest.artifacts).toHaveProperty('selectors/registry.json');
  });

  it('updates an existing execute-sourced element in place instead of duplicating it', async () => {
    const harness = createBrowserTestHarness();
    const { sessionId } = await runBrowserOpen(harness.context);

    const first = await runRegisterExecutedElement(harness.context, {
      sessionId,
      selector: 'text=Log in',
      kind: 'button',
    });
    const second = await runRegisterExecutedElement(harness.context, {
      sessionId,
      selector: 'text=Log in',
      kind: 'button',
      name: 'Log in button',
    });

    expect(second.created).toBe(false);
    expect(second.elementId).toBe(first.elementId);
    const registry = JSON.parse(String(harness.fs.getRawFile(REGISTRY_FILE_PATH))) as SelectorRegistry;
    expect(registry.elements).toHaveLength(1);
    expect(registry.elements[0]?.name).toBe('Log in button');
  });

  it('leaves other execute-sourced elements untouched when updating one', async () => {
    const harness = createBrowserTestHarness();
    const { sessionId } = await runBrowserOpen(harness.context);
    await runBrowserNavigate(harness.context, { sessionId, url: 'https://staging.example.test/login' });

    const first = await runRegisterExecutedElement(harness.context, {
      sessionId,
      selector: 'text=Log in',
      kind: 'button',
    });
    await runBrowserNavigate(harness.context, { sessionId, url: 'https://staging.example.test/tasks' });
    const second = await runRegisterExecutedElement(harness.context, {
      sessionId,
      selector: 'text=Add task',
      kind: 'button',
    });
    await runBrowserNavigate(harness.context, { sessionId, url: 'https://staging.example.test/login' });
    await runRegisterExecutedElement(harness.context, {
      sessionId,
      selector: 'text=Log in',
      kind: 'button',
      name: 'Log in button',
    });

    const registry = JSON.parse(String(harness.fs.getRawFile(REGISTRY_FILE_PATH))) as SelectorRegistry;
    expect(registry.elements).toHaveLength(2);
    const untouched = registry.elements.find((element) => element.elementId === second.elementId);
    expect(untouched).toMatchObject({
      elementId: second.elementId,
      pageUrl: 'https://staging.example.test/tasks',
    });
    const updated = registry.elements.find((element) => element.elementId === first.elementId);
    expect(updated?.name).toBe('Log in button');
  });

  it('rejects a selector that resolves to zero elements', async () => {
    const harness = createBrowserTestHarness({ launcherOptions: { locatorCounts: [0] } });
    const { sessionId } = await runBrowserOpen(harness.context);

    await expect(
      runRegisterExecutedElement(harness.context, { sessionId, selector: '.missing', kind: 'button' }),
    ).rejects.toMatchObject({ code: 'EXECUTE_SELECTOR_NOT_UNIQUE' });
  });

  it('rejects a selector that resolves to more than one element', async () => {
    const harness = createBrowserTestHarness({ launcherOptions: { locatorCounts: [2] } });
    const { sessionId } = await runBrowserOpen(harness.context);

    await expect(
      runRegisterExecutedElement(harness.context, { sessionId, selector: '.many', kind: 'button' }),
    ).rejects.toMatchObject({ code: 'EXECUTE_SELECTOR_NOT_UNIQUE' });
  });

  it('rejects an unknown session', async () => {
    const harness = createBrowserTestHarness();

    await expect(
      runRegisterExecutedElement(harness.context, {
        sessionId: 'session-gone',
        selector: 'text=Log in',
        kind: 'button',
      }),
    ).rejects.toMatchObject({ code: 'BROWSER_SESSION_NOT_FOUND' });
  });
});
