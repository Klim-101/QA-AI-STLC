// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { collectSpecs, type PlaywrightJsonReport } from './json-report.js';

const MESSAGE_LIMIT = 600;
// Playwright's own wording for a spec set that matched nothing. It is the ordinary "zero results"
// case `qa run` already reports with `RUN_NO_RESULTS`, so it is not a load failure.
const NO_TESTS_FOUND_PREFIX = 'Error: No tests found';

// Playwright colors error messages with ANSI escape codes even when writing to a JSON file.
function stripAnsiCodes(text: string): string {
  // eslint-disable-next-line no-control-regex -- ANSI escape sequences are control characters by definition.
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

/**
 * Why Playwright ran no tests at all when it said so itself: a spec that failed to load (a missing
 * import, two copies of `@playwright/test`), a config error. `undefined` when tests ran, or when
 * the only complaint is that nothing matched.
 */
export function describeLoadFailure(report: PlaywrightJsonReport): string | undefined {
  if (collectSpecs(report).length > 0) {
    return undefined;
  }
  const messages = report.errors
    .map((error) => stripAnsiCodes(error.message ?? '').trim())
    .filter((message) => message.length > 0 && !message.startsWith(NO_TESTS_FOUND_PREFIX));
  const [first] = messages;
  if (first === undefined) {
    return undefined;
  }
  return first.length > MESSAGE_LIMIT ? `${first.slice(0, MESSAGE_LIMIT)}…` : first;
}
