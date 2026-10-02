// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { WIDGET_RUNTIME_SOURCE } from './widget-runtime-source.js';

type SelectWidgetOption = (widget: unknown, optionText: string) => Promise<void>;

// The runtime is source text for a generated spec, so it is run the way a spec would: transpiled,
// then called with a scripted stand-in for Playwright's `Locator`.
function loadSelectWidgetOption(): SelectWidgetOption {
  const { outputText } = ts.transpileModule(WIDGET_RUNTIME_SOURCE, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  return runInNewContext(`${outputText}
selectWidgetOption;`) as SelectWidgetOption;
}

function createScriptedWidget(failedOptionClicks: number) {
  const state = { isOpen: false, optionClicks: 0, widgetClicks: 0 };
  const option = {
    getAttribute: () => Promise.resolve('false'),
    click: () => {
      state.optionClicks += 1;
      if (state.optionClicks <= failedOptionClicks) {
        // The popup closes itself, as the one this guards against did.
        state.isOpen = false;
        return Promise.reject(new Error(`click ${String(state.optionClicks)} failed`));
      }
      return Promise.resolve();
    },
  };
  const page = {
    locator: () => ({ getByRole: () => option }),
    waitForTimeout: () => Promise.resolve(),
  };
  const widget = {
    page: () => page,
    getAttribute: (name: string) =>
      Promise.resolve(
        name === 'aria-expanded' ? String(state.isOpen) : name === 'aria-controls' ? 'list-1' : null,
      ),
    locator: () => ({ count: () => Promise.resolve(0), all: () => Promise.resolve([]) }),
    click: () => {
      state.widgetClicks += 1;
      state.isOpen = true;
      return Promise.resolve();
    },
    press: () => {
      state.isOpen = false;
      return Promise.resolve();
    },
    innerText: () => Promise.resolve('Casey'),
  };
  return { widget, state };
}

describe('selectWidgetOption in the generated runtime', () => {
  it('reopens a popup that closed itself and clicks the option again', async () => {
    const { widget, state } = createScriptedWidget(1);

    await loadSelectWidgetOption()(widget, 'Casey');

    expect(state.optionClicks).toBe(2);
    expect(state.widgetClicks).toBe(2);
  });

  it('reports the failure of the second click', async () => {
    const { widget } = createScriptedWidget(2);

    await expect(loadSelectWidgetOption()(widget, 'Casey')).rejects.toThrow('click 2 failed');
  });
});
