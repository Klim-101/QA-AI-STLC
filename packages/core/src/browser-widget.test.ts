// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  optionSelector,
  popupScopeSelector,
  resolveWidget,
  setWidgetPopup,
  valueMismatch,
  verifyDisplayedText,
} from './browser-widget.js';
import type { WidgetInspection } from './browser-widget-page.js';
import { runBrowserOpen } from './operations/browser-open.js';
import {
  BROWSER_TEST_CONFIG_YAML,
  createBrowserTestHarness,
} from './test-support/browser-session-harness.js';
import {
  CLOSED_WIDGET,
  OPEN_WIDGET,
  scriptWidgetPage,
  type WidgetPageScript,
} from './test-support/widget-page-script.js';

async function openSession(script: WidgetPageScript, actionTimeoutMs = 30_000) {
  const harness = createBrowserTestHarness({
    configYaml: BROWSER_TEST_CONFIG_YAML.replace(
      '"staging.example.test"] }',
      `"staging.example.test"], actionTimeoutMs: ${String(actionTimeoutMs)} }`,
    ),
    launcherOptions: { locatorEvaluate: scriptWidgetPage(script) },
  });
  const { sessionId } = await runBrowserOpen(harness.context, {
    resolveLibraryWidgets: () => [{ wrapperSelector: '.wrapper', popupToggleSelector: '.toggle' }],
  });
  return { harness, session: await harness.sessions.get(sessionId) };
}

function clicks(harness: Awaited<ReturnType<typeof openSession>>['harness']): unknown[] {
  return harness.launcher.pageCalls.filter((call) => call.method === 'click').map((call) => call.args[0]);
}

function evaluatedFunctions(harness: Awaited<ReturnType<typeof openSession>>['harness']): unknown[] {
  return harness.launcher.pageCalls
    .filter((call) => call.method === 'locatorEvaluate')
    .map((call) => call.args[1]);
}

describe('resolveWidget', () => {
  it('addresses the located element itself when it is the widget wrapper', async () => {
    const { harness, session } = await openSession({});

    const widget = await resolveWidget(session, '.wrapper');

    expect(widget).toEqual({ root: '.wrapper', inspection: CLOSED_WIDGET });
    const inspectCall = harness.launcher.pageCalls.find((call) => call.method === 'locatorEvaluate');
    expect(inspectCall?.args[2]).toEqual({
      targets: [{ wrapperSelector: '.wrapper', popupToggleSelector: '.toggle' }],
    });
  });

  it('climbs from a control inside the widget to its wrapper', async () => {
    const { session } = await openSession({ inspections: [{ ...CLOSED_WIDGET, depth: 2 }] });

    const widget = await resolveWidget(session, 'role=combobox[name="Owner"]');

    expect(widget.root).toBe('role=combobox[name="Owner"] >> xpath=../..');
  });
});

describe('setWidgetPopup', () => {
  it('clicks the widget toggle to open a closed popup and reports the widget afterwards', async () => {
    const { harness, session } = await openSession({ inspections: [CLOSED_WIDGET, OPEN_WIDGET] });

    const widget = await setWidgetPopup(session, '.wrapper', true);

    expect(clicks(harness)).toEqual(['.wrapper >> css=.toggle']);
    expect(widget.inspection.isOpen).toBe(true);
  });

  it('clicks the widget itself when its profile names no toggle', async () => {
    const { harness, session } = await openSession({
      inspections: [{ ...CLOSED_WIDGET, toggleSelector: null }, OPEN_WIDGET],
    });

    await setWidgetPopup(session, '.wrapper', true);

    expect(clicks(harness)).toEqual(['.wrapper']);
  });

  it('does nothing when the popup is already in the wanted state', async () => {
    const { harness, session } = await openSession({ inspections: [OPEN_WIDGET] });

    await setWidgetPopup(session, '.wrapper', true);

    expect(clicks(harness)).toEqual([]);
    expect(evaluatedFunctions(harness)).not.toContain('waitForPopupState');
  });

  it('closes with Escape first, and does not click when that is enough', async () => {
    const { harness, session } = await openSession({ inspections: [OPEN_WIDGET, CLOSED_WIDGET] });

    await setWidgetPopup(session, '.wrapper', false);

    expect(evaluatedFunctions(harness)).toContain('dismissWithEscape');
    expect(clicks(harness)).toEqual([]);
  });

  it('falls back to the toggle when Escape did not close the popup', async () => {
    const { harness, session } = await openSession({
      inspections: [OPEN_WIDGET, CLOSED_WIDGET],
      popupWaits: [false, true],
    });

    await setWidgetPopup(session, '.wrapper', false);

    expect(clicks(harness)).toEqual(['.wrapper >> css=.toggle']);
  });

  it('clicks once more when the popup ignored the first click, then waits the full timeout', async () => {
    const { harness, session } = await openSession({
      inspections: [CLOSED_WIDGET, OPEN_WIDGET],
      popupWaits: [false, true],
    });

    await setWidgetPopup(session, '.wrapper', true);

    expect(clicks(harness)).toHaveLength(2);
    const waits = harness.launcher.pageCalls
      .filter((call) => call.method === 'locatorEvaluate' && call.args[1] === 'waitForPopupState')
      .map((call) => (call.args[2] as { timeoutMs: number }).timeoutMs);
    expect(waits).toEqual([1_000, 30_000]);
  });

  it('never waits longer than the action timeout for a popup to settle', async () => {
    const { harness, session } = await openSession({ popupWaits: [false, true] }, 400);

    await setWidgetPopup(session, '.wrapper', true);

    const [firstWait] = harness.launcher.pageCalls
      .filter((call) => call.method === 'locatorEvaluate' && call.args[1] === 'waitForPopupState')
      .map((call) => (call.args[2] as { timeoutMs: number }).timeoutMs);
    expect(firstWait).toBe(400);
  });

  it('fails with BROWSER_WIDGET_POPUP_STATE naming the direction when the popup never follows', async () => {
    const opening = await openSession({ popupWaits: [false] });
    await expect(setWidgetPopup(opening.session, '.wrapper', true)).rejects.toMatchObject({
      code: 'BROWSER_WIDGET_POPUP_STATE',
      message: 'The popup of ".wrapper" did not open within 30000 ms',
    });

    const closing = await openSession({ inspections: [OPEN_WIDGET], popupWaits: [false] });
    await expect(setWidgetPopup(closing.session, '.wrapper', false)).rejects.toMatchObject({
      code: 'BROWSER_WIDGET_POPUP_STATE',
      message: 'The popup of ".wrapper" did not close within 30000 ms',
    });
    expect(clicks(closing.harness)).toHaveLength(2);
  });

  it('waits for busy indicators before it looks at the widget and after the popup settled', async () => {
    const harness = createBrowserTestHarness({
      configYaml: `${BROWSER_TEST_CONFIG_YAML}ui: { busySelectors: [".mask"] }\n`,
      launcherOptions: { evaluateResult: null, locatorEvaluate: scriptWidgetPage({}) },
    });
    const { sessionId } = await runBrowserOpen(harness.context);
    const session = await harness.sessions.get(sessionId);

    await setWidgetPopup(session, '.wrapper', true);

    expect(
      harness.launcher.pageCalls
        .filter((call) => call.method === 'evaluate' || call.method === 'locatorEvaluate')
        .map((call) => call.method),
    ).toEqual([
      'evaluate',
      'locatorEvaluate',
      'locatorEvaluate',
      'locatorEvaluate',
      'evaluate',
      'locatorEvaluate',
      'locatorEvaluate',
    ]);
  });

  it('lets animations finish before it reads the popup and again before it reports it, for at most two seconds each', async () => {
    const roomy = await openSession({ inspections: [CLOSED_WIDGET, OPEN_WIDGET] });
    await setWidgetPopup(roomy.session, '.wrapper', true);
    const tight = await openSession({ inspections: [CLOSED_WIDGET, OPEN_WIDGET] }, 400);
    await setWidgetPopup(tight.session, '.wrapper', true);

    const animationWaits = (harness: typeof roomy.harness): unknown[] =>
      harness.launcher.pageCalls
        .filter((call) => call.method === 'locatorEvaluate' && call.args[1] === 'waitForAnimations')
        .map((call) => call.args[2]);
    expect(animationWaits(roomy.harness)).toEqual([{ timeoutMs: 2_000 }, { timeoutMs: 2_000 }]);
    expect(animationWaits(tight.harness)).toEqual([{ timeoutMs: 400 }, { timeoutMs: 400 }]);
  });
});

describe('popup and option selectors', () => {
  const inspection = (popupId: string | null): WidgetInspection => ({ ...CLOSED_WIDGET, popupId });

  it('scopes to the popup the widget controls, or to any visible listbox when it names none', () => {
    expect(popupScopeSelector(inspection('list-1'))).toBe('css=[id="list-1"]');
    expect(popupScopeSelector(inspection(null))).toBe('css=[role="listbox"]:visible');
  });

  it('finds an option by its whole text, whether or not an inner element holds the text', () => {
    expect(optionSelector(inspection('list-1'), 'Say "hi"')).toBe(
      'css=[id="list-1"] >> css=[role="option"]:text-is("Say \\"hi\\""), [role="option"]:has(:text-is("Say \\"hi\\""))',
    );
  });
});

describe('verifyDisplayedText', () => {
  const widget = { root: '.wrapper', inspection: CLOSED_WIDGET };

  it('accepts a widget that shows the text', async () => {
    const { session } = await openSession({ displayedText: 'Open\nv' });

    await expect(verifyDisplayedText(session, widget, '.wrapper', 'Open')).resolves.toBeUndefined();
  });

  it('fails with BROWSER_WIDGET_VALUE_MISMATCH when the widget shows something else', async () => {
    const { session } = await openSession({ displayedText: 'Select...' });

    await expect(verifyDisplayedText(session, widget, '.wrapper', 'Done')).rejects.toMatchObject({
      code: 'BROWSER_WIDGET_VALUE_MISMATCH',
      message: '".wrapper" does not show "Done" after the action; it shows "Select..."',
    });
  });

  it('treats an answer that is not text as showing nothing', async () => {
    const { session } = await openSession({ displayedText: undefined });

    await expect(verifyDisplayedText(session, widget, '.wrapper', 'Done')).rejects.toMatchObject({
      message: '".wrapper" does not show "Done" after the action; it shows ""',
    });
  });
});

describe('valueMismatch', () => {
  it('collapses whitespace and caps what it quotes from the page', () => {
    const error = valueMismatch('.wrapper', 'x', `a\n\n  b ${'c'.repeat(500)}`);

    expect(error.message).toBe(
      `".wrapper" does not show "x" after the action; it shows "a b ${'c'.repeat(116)}"`,
    );
  });
});
