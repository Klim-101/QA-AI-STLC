// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// The runtime the widget helpers in a generated `tests/qa/locators.ts` call (P6-43). It is source
// text, not code: the module carries its own copy so a generated spec depends on Playwright alone,
// never on this framework. It mirrors what the engine's `qa.browser_select_option`,
// `qa.browser_set_date` and popup tools do, in Playwright's own locator API, and checks the same
// thing: the widget shows the result. The text contains no backtick, `${` or backslash, so it can
// sit in a template literal unchanged.
export const WIDGET_RUNTIME_SOURCE = `const WIDGET_TIMEOUT_MS = 5_000;
const WIDGET_SETTLE_MS = 1_000;
const WIDGET_POLL_MS = 50;

// A locator built from the accessibility tree often resolves to a control inside the widget (the
// input a combo box renders), so the wrapper is the nearest ancestor-or-self matching the library's
// wrapper selector.
function widgetRoot(located: Locator, wrapperSelector: string): Locator {
  return located.locator('xpath=ancestor-or-self::*').and(located.page().locator(wrapperSelector)).last();
}

async function isWidgetPopupOpen(widget: Locator): Promise<boolean> {
  return (
    (await widget.getAttribute('aria-expanded')) === 'true' ||
    (await widget.locator('[aria-expanded="true"]').count()) > 0
  );
}

async function waitForWidgetPopup(widget: Locator, wantOpen: boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while ((await isWidgetPopupOpen(widget)) !== wantOpen) {
    if (Date.now() >= deadline) {
      return false;
    }
    await widget.page().waitForTimeout(WIDGET_POLL_MS);
  }
  return true;
}

async function readWidgetPopupId(widget: Locator): Promise<string | null> {
  const owners = widget.locator('[aria-controls], [aria-owns]');
  const own = (await widget.getAttribute('aria-controls')) ?? (await widget.getAttribute('aria-owns'));
  if (own !== null && own !== '') {
    return own;
  }
  if ((await owners.count()) === 0) {
    return null;
  }
  return (await owners.first().getAttribute('aria-controls')) ?? (await owners.first().getAttribute('aria-owns'));
}

async function readWidgetText(widget: Locator): Promise<string> {
  const inputValues: string[] = [];
  for (const input of await widget.locator('input:visible').all()) {
    inputValues.push(await input.inputValue());
  }
  return [await widget.innerText(), ...inputValues].join(' ');
}

// A popup that has just changed state ignores input while it animates, so one that did not follow
// an action gets the next before the final full wait. Closing tries Escape first: some widgets
// (a multi-select) have a toggle that only ever opens.
async function setWidgetPopup(widget: Locator, wantOpen: boolean, toggleSelector?: string): Promise<void> {
  if ((await isWidgetPopupOpen(widget)) === wantOpen) {
    return;
  }
  const toggle = toggleSelector === undefined ? widget : widget.locator(toggleSelector).first();
  const clickToggle = (): Promise<void> => toggle.click();
  const attempts = wantOpen
    ? [clickToggle, clickToggle]
    : [(): Promise<void> => widget.press('Escape'), clickToggle, clickToggle];
  for (const [index, attempt] of attempts.entries()) {
    await attempt();
    const timeoutMs = index === attempts.length - 1 ? WIDGET_TIMEOUT_MS : WIDGET_SETTLE_MS;
    if (await waitForWidgetPopup(widget, wantOpen, timeoutMs)) {
      return;
    }
  }
  throw new Error('The widget popup did not ' + (wantOpen ? 'open' : 'close') + ' within ' + String(WIDGET_TIMEOUT_MS) + ' ms');
}

// Choosing an option that is already chosen leaves it chosen: a multi-select would un-pick it.
async function selectWidgetOption(widget: Locator, optionText: string, toggleSelector?: string): Promise<void> {
  await setWidgetPopup(widget, true, toggleSelector);
  const popupId = await readWidgetPopupId(widget);
  const popup =
    popupId === null
      ? widget.page().locator('[role="listbox"]:visible')
      : widget.page().locator('[id=' + JSON.stringify(popupId) + ']');
  const option = popup.getByRole('option', { name: optionText, exact: true });
  if ((await option.getAttribute('aria-selected', { timeout: WIDGET_TIMEOUT_MS })) !== 'true') {
    try {
      await option.click({ timeout: WIDGET_TIMEOUT_MS });
    } catch {
      // A popup that closed itself before the click landed is reopened and the click repeated once.
      await setWidgetPopup(widget, true, toggleSelector);
      await option.click({ timeout: WIDGET_TIMEOUT_MS });
    }
  }
  await setWidgetPopup(widget, false, toggleSelector);
  const shown = await readWidgetText(widget);
  if (!shown.includes(optionText)) {
    throw new Error('The widget does not show "' + optionText + '" after choosing it; it shows "' + shown + '"');
  }
}

async function setWidgetDate(widget: Locator, value: string): Promise<void> {
  const input = widget.locator('input:visible').first();
  await input.fill(value);
  await input.blur();
  const shown = await input.inputValue();
  if (shown.trim() !== value.trim()) {
    throw new Error('The date picker does not hold "' + value + '" after typing it; it holds "' + shown + '"');
  }
}`;
