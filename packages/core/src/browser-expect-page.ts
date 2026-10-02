// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Runs inside the page under test, where nothing from the surrounding module exists, and this
// package compiles without DOM types: each function types the few DOM members it touches for
// itself. The browser's own V8 instance is invisible to Node coverage, so the real-browser test
// (`test/browser-expect-demo-app.test.ts`) is what exercises it.
/* v8 ignore start */

interface ExpectElement {
  readonly innerText?: string;
  readonly textContent: string | null;
  readonly value?: unknown;
  readonly checked?: unknown;
  readonly type?: unknown;
  getAttribute(name: string): string | null;
  getBoundingClientRect(): { readonly width: number; readonly height: number };
}

/** The most text read from one element; a longer text is cut before it leaves the page. */
export const MAX_ELEMENT_TEXT_CHARS = 20_000;

/**
 * What the page shows for the one element an expectation targets. Visible follows Playwright's
 * own definition: a non-empty box and no `visibility: hidden`.
 */
export function readElementState(element: ExpectElement): unknown {
  const page = globalThis as unknown as {
    getComputedStyle(target: ExpectElement): { readonly visibility: string };
  };
  const box = element.getBoundingClientRect();
  const ariaChecked = element.getAttribute('aria-checked');
  let checked: boolean | null = null;
  if (typeof element.checked === 'boolean') {
    checked = element.checked;
  } else if (ariaChecked === 'true' || ariaChecked === 'false') {
    checked = ariaChecked === 'true';
  }
  return {
    visible: box.width > 0 && box.height > 0 && page.getComputedStyle(element).visibility !== 'hidden',
    text: (element.innerText ?? element.textContent ?? '').slice(0, 20_000),
    value: typeof element.value === 'string' ? element.value : null,
    checked,
    inputType: typeof element.type === 'string' ? element.type : null,
  };
}

/** Waits inside the page, so the engine's own polling loop needs no timer of its own. */
export function sleepInPage(milliseconds: number): Promise<unknown> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/* v8 ignore stop */
