// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BROWSER_TEST_CONFIG_YAML,
  createBrowserTestHarness,
} from '../test-support/browser-session-harness.js';
import {
  CLOSED_WIDGET,
  OPEN_WIDGET,
  scriptWidgetPage,
  type WidgetPageScript,
} from '../test-support/widget-page-script.js';
import { runBrowserNavigate } from './browser-navigate.js';
import { runBrowserOpen } from './browser-open.js';
import { runBrowserClosePopup, runBrowserOpenPopup } from './browser-popup.js';
import { runBrowserSelectOption } from './browser-select-option.js';
import { runBrowserSetDate } from './browser-set-date.js';

async function openSession(script: WidgetPageScript, clickOutcomes?: readonly (Error | undefined)[]) {
  const harness = createBrowserTestHarness({
    launcherOptions: {
      locatorEvaluate: scriptWidgetPage(script),
      ...(clickOutcomes === undefined ? {} : { clickOutcomes }),
    },
  });
  const { sessionId } = await runBrowserOpen(harness.context);
  await runBrowserNavigate(harness.context, { sessionId, url: 'https://staging.example.test/form' });
  return { harness, sessionId };
}

function calls(harness: Awaited<ReturnType<typeof openSession>>['harness'], method: string): unknown[][] {
  return harness.launcher.pageCalls.filter((call) => call.method === method).map((call) => [...call.args]);
}

function readEvidence(
  harness: Awaited<ReturnType<typeof openSession>>['harness'],
  path: string,
): Record<string, unknown> {
  return JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', path)))) as Record<string, unknown>;
}

const TOGGLE = '.wrapper >> css=.toggle';
const OPTION =
  'css=[id="list-1"] >> css=[role="option"]:text-is("Open"), [role="option"]:has(:text-is("Open"))';

describe('runBrowserSelectOption', () => {
  const script: WidgetPageScript = {
    inspections: [CLOSED_WIDGET, OPEN_WIDGET, OPEN_WIDGET, CLOSED_WIDGET],
    optionSelected: 'false',
    displayedText: 'Open',
  };

  it('opens the list, clicks the option with that text, closes the list and checks what the widget shows', async () => {
    const { harness, sessionId } = await openSession(script);

    const result = await runBrowserSelectOption(harness.context, {
      sessionId,
      selector: '.wrapper',
      optionText: 'Open',
    });

    expect(calls(harness, 'click').map(([selector]) => selector)).toEqual([TOGGLE, OPTION]);
    expect(result).toMatchObject({
      sessionId,
      selector: '.wrapper',
      url: 'https://staging.example.test/form',
    });
  });

  it('reopens a popup that closed itself and clicks the option again', async () => {
    const { harness, sessionId } = await openSession(
      {
        ...script,
        inspections: [CLOSED_WIDGET, OPEN_WIDGET, CLOSED_WIDGET, OPEN_WIDGET, OPEN_WIDGET, CLOSED_WIDGET],
      },
      [undefined, new Error('element is not visible')],
    );

    await runBrowserSelectOption(harness.context, { sessionId, selector: '.wrapper', optionText: 'Open' });

    expect(calls(harness, 'click').map(([selector]) => selector)).toEqual([TOGGLE, OPTION, TOGGLE, OPTION]);
  });

  it('reports the failure of the second click when the option still cannot be clicked', async () => {
    const second = new Error('intercepts pointer events');
    const { harness, sessionId } = await openSession(
      { ...script, inspections: [CLOSED_WIDGET, OPEN_WIDGET, OPEN_WIDGET, OPEN_WIDGET, OPEN_WIDGET] },
      [undefined, new Error('element is not visible'), second],
    );

    await expect(
      runBrowserSelectOption(harness.context, { sessionId, selector: '.wrapper', optionText: 'Open' }),
    ).rejects.toBe(second);
    expect(calls(harness, 'click').map(([selector]) => selector)).toEqual([TOGGLE, OPTION, OPTION]);
  });

  it('records the choice by its length, not its text, and carries a stepId', async () => {
    const { harness, sessionId } = await openSession(script);

    const result = await runBrowserSelectOption(harness.context, {
      sessionId,
      selector: '.wrapper',
      optionText: 'Open',
      stepId: 'step-3',
    });

    expect(readEvidence(harness, result.evidence.path)).toEqual({
      schemaVersion: 1,
      type: 'select-option',
      sessionId,
      stepId: 'step-3',
      selector: '.wrapper',
      url: 'https://staging.example.test/form',
      valueLength: 4,
      at: '2026-09-21T10:00:00.000Z',
    });
  });

  it('does not click an option that is already chosen, so a multi-select does not un-pick it', async () => {
    const { harness, sessionId } = await openSession({ ...script, optionSelected: 'true' });

    await runBrowserSelectOption(harness.context, { sessionId, selector: '.wrapper', optionText: 'Open' });

    expect(calls(harness, 'click').map(([selector]) => selector)).toEqual([TOGGLE]);
  });

  it('fails with BROWSER_WIDGET_OPTION_NOT_FOUND, keeping the cause, for an option the list lacks', async () => {
    const cause = new Error('Timeout 30000ms exceeded');
    const { harness, sessionId } = await openSession({ ...script, optionSelected: cause });

    await expect(
      runBrowserSelectOption(harness.context, { sessionId, selector: '.wrapper', optionText: 'Open' }),
    ).rejects.toMatchObject({ code: 'BROWSER_WIDGET_OPTION_NOT_FOUND', cause });
  });

  it('chooses again when the widget does not show the choice at first, and records it once', async () => {
    const { harness, sessionId } = await openSession({
      ...script,
      inspections: [
        CLOSED_WIDGET,
        OPEN_WIDGET,
        OPEN_WIDGET,
        CLOSED_WIDGET,
        CLOSED_WIDGET,
        OPEN_WIDGET,
        OPEN_WIDGET,
        CLOSED_WIDGET,
      ],
      displayedTexts: ['Select...', 'Open'],
    });

    const result = await runBrowserSelectOption(harness.context, {
      sessionId,
      selector: '.wrapper',
      optionText: 'Open',
    });

    expect(calls(harness, 'click').map(([selector]) => selector)).toEqual([TOGGLE, OPTION, TOGGLE, OPTION]);
    expect(readEvidence(harness, result.evidence.path)).toMatchObject({ type: 'select-option' });
  });

  it('fails and records nothing when the widget does not show the choice afterwards', async () => {
    const { harness, sessionId } = await openSession({ ...script, displayedText: 'Select...' });
    const { runId } = await harness.sessions.get(sessionId);
    const evidenceDirectory = join('project', '.qa', 'evidence', runId);
    const evidenceBefore = await harness.fs.listFiles(evidenceDirectory);

    await expect(
      runBrowserSelectOption(harness.context, { sessionId, selector: '.wrapper', optionText: 'Open' }),
    ).rejects.toMatchObject({ code: 'BROWSER_WIDGET_VALUE_MISMATCH' });
    expect(await harness.fs.listFiles(evidenceDirectory)).toEqual(evidenceBefore);
  });

  it('rejects an unknown session', async () => {
    const harness = createBrowserTestHarness();

    await expect(
      runBrowserSelectOption(harness.context, { sessionId: 'session-gone', selector: 'x', optionText: 'y' }),
    ).rejects.toMatchObject({ code: 'BROWSER_SESSION_NOT_FOUND' });
  });
});

describe('runBrowserSetDate', () => {
  it('types the date into the visible input of the widget, commits it and checks the input holds it', async () => {
    const { harness, sessionId } = await openSession({ inputValue: '2031-04-15' });

    const result = await runBrowserSetDate(harness.context, {
      sessionId,
      selector: '.wrapper',
      value: '2031-04-15',
    });

    expect(calls(harness, 'fill')).toEqual([
      ['.wrapper >> css=input:visible', '2031-04-15', { timeout: 30_000 }],
    ]);
    expect(calls(harness, 'locatorEvaluate').map((call) => call[1])).toEqual([
      'inspectWidget',
      'commitInput',
      'readInputValue',
    ]);
    expect(readEvidence(harness, result.evidence.path)).toMatchObject({ type: 'set-date', valueLength: 10 });
  });

  it('addresses the input through the wrapper when the selector points inside the widget', async () => {
    const { harness, sessionId } = await openSession({
      inspections: [{ ...CLOSED_WIDGET, depth: 1 }],
      inputValue: '2031-04-15',
    });

    await runBrowserSetDate(harness.context, { sessionId, selector: 'role=combobox', value: '2031-04-15' });

    expect(calls(harness, 'fill')[0]?.[0]).toBe('role=combobox >> xpath=.. >> css=input:visible');
  });

  it('fails when the widget rewrote or cleared the date, and records nothing', async () => {
    const { harness, sessionId } = await openSession({ inputValue: '' });

    await expect(
      runBrowserSetDate(harness.context, { sessionId, selector: '.wrapper', value: '2031-04-15' }),
    ).rejects.toMatchObject({ code: 'BROWSER_WIDGET_VALUE_MISMATCH' });
  });

  it('treats an answer that is not text as an empty input', async () => {
    const { harness, sessionId } = await openSession({ inputValue: undefined });

    await expect(
      runBrowserSetDate(harness.context, { sessionId, selector: '.wrapper', value: '2031-04-15' }),
    ).rejects.toMatchObject({ message: expect.stringContaining('it shows ""') as unknown });
  });

  it('ignores surrounding whitespace when comparing', async () => {
    const { harness, sessionId } = await openSession({ inputValue: ' 2031-04-15 ' });

    await expect(
      runBrowserSetDate(harness.context, { sessionId, selector: '.wrapper', value: '2031-04-15' }),
    ).resolves.toBeDefined();
  });
});

describe('runBrowserOpenPopup and runBrowserClosePopup', () => {
  it('opens a closed popup and records an open-popup action without a value length', async () => {
    const { harness, sessionId } = await openSession({ inspections: [CLOSED_WIDGET, OPEN_WIDGET] });

    const result = await runBrowserOpenPopup(harness.context, { sessionId, selector: '.wrapper' });

    expect(calls(harness, 'click')).toHaveLength(1);
    const evidence = readEvidence(harness, result.evidence.path);
    expect(evidence).toMatchObject({ type: 'open-popup', selector: '.wrapper' });
    expect(evidence).not.toHaveProperty('valueLength');
  });

  it('closes an open popup', async () => {
    const { harness, sessionId } = await openSession({ inspections: [OPEN_WIDGET, CLOSED_WIDGET] });

    const result = await runBrowserClosePopup(harness.context, { sessionId, selector: '.wrapper' });

    expect(readEvidence(harness, result.evidence.path)).toMatchObject({ type: 'close-popup' });
  });

  it('is a safe retry: an open popup stays open and a closed one stays closed', async () => {
    const opened = await openSession({ inspections: [OPEN_WIDGET] });
    await runBrowserOpenPopup(opened.harness.context, { sessionId: opened.sessionId, selector: '.wrapper' });
    const closed = await openSession({ inspections: [CLOSED_WIDGET] });
    await runBrowserClosePopup(closed.harness.context, { sessionId: closed.sessionId, selector: '.wrapper' });

    expect(calls(opened.harness, 'click')).toEqual([]);
    expect(calls(closed.harness, 'click')).toEqual([]);
  });
});

describe('widget actions in a project that sets its own action timeout', () => {
  it('passes the environment timeout to the page and to the clicks', async () => {
    const harness = createBrowserTestHarness({
      configYaml: BROWSER_TEST_CONFIG_YAML.replace(
        '"staging.example.test"] }',
        '"staging.example.test"], actionTimeoutMs: 5000 }',
      ),
      launcherOptions: { locatorEvaluate: scriptWidgetPage({ inspections: [CLOSED_WIDGET, OPEN_WIDGET] }) },
    });
    const { sessionId } = await runBrowserOpen(harness.context);

    await runBrowserOpenPopup(harness.context, { sessionId, selector: '.wrapper' });

    expect(calls(harness, 'click')[0]?.[1]).toEqual({ timeout: 5_000 });
  });
});
