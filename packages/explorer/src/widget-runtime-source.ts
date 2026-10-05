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
const WIDGET_ANIMATION_MS = 2_000;

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

// A list that is still animating open can drop an option click: it closes without choosing. Waits
// until no finite animation is running on the page, or the timeout passes; endless ones (a spinner)
// are not waited for.
async function waitForWidgetAnimations(widget: Locator): Promise<void> {
  await widget.evaluate(async (_element, timeoutMs) => {
    const { document, setTimeout, requestAnimationFrame } = globalThis as unknown as {
      setTimeout(callback: (value?: unknown) => void, delayMs: number): unknown;
      requestAnimationFrame(callback: () => void): unknown;
      document: {
        getAnimations(): {
          finished: Promise<unknown>;
          effect: { getComputedTiming(): { endTime: number | string } } | null;
        }[];
      };
    };
    const deadline = Date.now() + timeoutMs;
    // A list that has just been attached starts its animation on the next frames.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const finite = () =>
      document.getAnimations().filter((animation) => Number.isFinite(Number(animation.effect?.getComputedTiming().endTime)));
    for (let running = finite(); running.length > 0 && Date.now() < deadline; running = finite()) {
      await Promise.race([
        Promise.allSettled(running.map((animation) => animation.finished)),
        new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - Date.now()))),
      ]);
    }
  }, WIDGET_ANIMATION_MS);
}

// A popup that has just changed state ignores input while it animates, so one that did not follow
// an action gets the next before the final full wait. Closing tries Escape first: some widgets
// (a multi-select) have a toggle that only ever opens.
async function setWidgetPopup(widget: Locator, wantOpen: boolean, toggleSelector?: string): Promise<void> {
  if ((await isWidgetPopupOpen(widget)) === wantOpen) {
    return;
  }
  // A popup that is closing on its own still reports open while it animates; Escape then makes a
  // Kendo UI for Angular multiselect drop the choice just made. Wait, then look again.
  await waitForWidgetAnimations(widget);
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
      await waitForWidgetAnimations(widget);
      return;
    }
  }
  throw new Error('The widget popup did not ' + (wantOpen ? 'open' : 'close') + ' within ' + String(WIDGET_TIMEOUT_MS) + ' ms');
}

// Choosing an option that is already chosen leaves it chosen: a multi-select would un-pick it.
// Returns what the widget shows when it does not show the option, null when it does.
async function chooseWidgetOption(widget: Locator, optionText: string, toggleSelector?: string): Promise<string | null> {
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
  return shown.includes(optionText) ? null : shown;
}

// A widget can take a moment to show a choice, or drop a click that lands while its list is still
// animating on a loaded machine, so a choice it does not show is made once more before it fails.
async function selectWidgetOption(widget: Locator, optionText: string, toggleSelector?: string): Promise<void> {
  const shown =
    (await chooseWidgetOption(widget, optionText, toggleSelector)) === null
      ? null
      : await chooseWidgetOption(widget, optionText, toggleSelector);
  if (shown !== null) {
    throw new Error('The widget does not show "' + optionText + '" after choosing it; it shows "' + shown + '"');
  }
}

// A segmented masked input turns a filled string into a different date but takes the digits typed
// one key at a time, each filling the next segment; typing over a selected value replaces it.
async function setWidgetDate(widget: Locator, value: string, entry?: 'digits'): Promise<void> {
  const input = widget.locator('input:visible').first();
  if (entry === 'digits') {
    await input.click();
    await input.press('Control+a');
    for (const digit of value.replace(/[^0-9]/g, '')) {
      await input.press(digit);
    }
  } else {
    await input.fill(value);
  }
  await input.blur();
  const shown = await input.inputValue();
  if (shown.trim() !== value.trim()) {
    throw new Error('The date picker does not hold "' + value + '" after typing it; it holds "' + shown + '"');
  }
}`;
