// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * The selector engines Playwright's injected script registers. A browser tool hands its `selector` to
 * `page.locator`, which fails with `Unknown engine "<name>"` for anything else, so a case that names
 * another engine (`label=Title`, `testid=save`) can only fail at execution, after it was approved.
 */
const SELECTOR_ENGINES: ReadonlySet<string> = new Set([
  'above',
  'aria-ref',
  'aria-template',
  'below',
  'css',
  'data-test',
  'data-test-id',
  'data-testid',
  'has',
  'has-text',
  'id',
  'internal:and',
  'internal:attr',
  'internal:chain',
  'internal:control',
  'internal:describe',
  'internal:has',
  'internal:has-not',
  'internal:has-not-text',
  'internal:has-text',
  'internal:label',
  'internal:or',
  'internal:role',
  'internal:testid',
  'internal:text',
  'is',
  'left-of',
  'light',
  'near',
  'not',
  'nth',
  'nth-match',
  'right-of',
  'role',
  'scope',
  'text',
  'text-is',
  'text-matches',
  'visible',
  'where',
  'xpath',
]);

/** A short list for an error message: the engines a hand-written case selector realistically uses. */
export const COMMON_SELECTOR_FORMS: readonly string[] = [
  'a CSS selector such as #save or [data-testid="save"]',
  'role=button[name="Save"]',
  'text=Save',
  'data-testid=save',
  'id=save',
  'an XPath starting with // or ..',
  'parts joined with >>',
];

// Playwright's own rule for telling an engine prefix from CSS: whatever precedes the first "=" is an
// engine name when it is made only of these characters, so `[name=a]` and `a[href=b]` stay CSS.
const ENGINE_NAME = /^[a-zA-Z_0-9\-+:*]+$/u;

/** Splits on `>>` outside quotes, the way Playwright does before it reads each part. */
function splitSelectorParts(selector: string): string[] {
  const parts: string[] = [];
  let quote: string | undefined;
  let start = 0;
  for (let index = 0; index < selector.length; index += 1) {
    const char = selector.charAt(index);
    if (quote !== undefined) {
      if (char === '\\') {
        index += 1;
      } else if (char === quote) {
        quote = undefined;
      }
    } else if (char === '"' || char === "'" || char === '`') {
      quote = char;
    } else if (char === '>' && selector.charAt(index + 1) === '>') {
      parts.push(selector.slice(start, index));
      start = index + 2;
      index += 1;
    }
  }
  parts.push(selector.slice(start));
  return parts;
}

/**
 * The engine name of the first part of `selector` that Playwright would reject as unknown, or
 * `undefined` when every part is a form a browser tool executes.
 */
export function findUnsupportedSelectorEngine(selector: string): string | undefined {
  for (const raw of splitSelectorParts(selector)) {
    const part = raw.trim();
    const equals = part.indexOf('=');
    if (equals === -1 || part.startsWith('"') || part.startsWith("'") || part.startsWith('/')) {
      continue;
    }
    const written = part.slice(0, equals).trim();
    if (!ENGINE_NAME.test(written)) {
      continue;
    }
    // A leading "*" marks the part whose element is returned; ":light" skips shadow DOM piercing.
    const name = written.toLowerCase().replace(/^\*/u, '');
    const base = name.endsWith(':light') ? name.slice(0, -':light'.length) : name;
    if (!SELECTOR_ENGINES.has(name) && !SELECTOR_ENGINES.has(base)) {
      return written;
    }
  }
  return undefined;
}
