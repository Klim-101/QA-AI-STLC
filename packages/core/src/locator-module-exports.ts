// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { LocatorModuleExport } from '@qa-ai-stlc/schemas';
import { QaError } from './errors.js';

const ELEMENTS_PREFIX = '// elements: ';
const FUNCTION_PREFIX = 'export function ';
const FUNCTION_SIGNATURE_SUFFIX = '(page: Page): Locator {';

/**
 * Reads which registry element each locator function of a generated `tests/qa/locators.ts` answers.
 * The generator writes `// elements: <id> <id>` above every function, so elements that share one
 * locator all map to the function that really exists. Parsing the module rather than the registry
 * keeps the list a spec may import equal to what the file on disk exports.
 *
 * Plain string operations on purpose: `noUncheckedIndexedAccess` would force an unreachable
 * fallback on every capture group of an equivalent regular expression.
 */
export function parseLocatorModuleExports(source: string): readonly LocatorModuleExport[] {
  const exports: LocatorModuleExport[] = [];
  let pendingElementIds: string[] = [];
  let hasUnmarkedFunction = false;
  for (const line of source.split('\n')) {
    if (line.startsWith(ELEMENTS_PREFIX)) {
      pendingElementIds = line.slice(ELEMENTS_PREFIX.length).trim().split(' ');
    } else if (line.startsWith(FUNCTION_PREFIX) && line.endsWith(FUNCTION_SIGNATURE_SUFFIX)) {
      const name = line.slice(FUNCTION_PREFIX.length, line.length - FUNCTION_SIGNATURE_SUFFIX.length);
      hasUnmarkedFunction ||= pendingElementIds.length === 0;
      exports.push(...pendingElementIds.map((elementId) => ({ elementId, name })));
      pendingElementIds = [];
    }
  }
  if (hasUnmarkedFunction) {
    throw new QaError(
      'GENERATION_LOCATOR_MODULE_OUTDATED',
      'The locator module does not say which element each function answers, so it was written by an older generator.',
      { remediation: 'Re-run "qa explore" to regenerate the locator module.' },
    );
  }
  return exports.sort((a, b) => a.elementId.localeCompare(b.elementId));
}
