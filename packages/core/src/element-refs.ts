// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { BrowserActionRef } from '@qa-ai-stlc/schemas';
import type { BrowserSession } from './browser-session-store.js';
import { QaError } from './errors.js';
import type { PageViewRef } from './page-view.js';

/** The refs the latest snapshot of a session handed out, and the page they were read from. */
export interface ElementRefTable {
  readonly url: string;
  readonly byRef: ReadonlyMap<string, PageViewRef>;
}

export interface BrowserTargetOptions {
  /** A Playwright selector; exactly one of `selector` and `ref` is given. */
  readonly selector?: string | undefined;
  /** A ref from the session's latest `qa.browser_snapshot`. */
  readonly ref?: string | undefined;
}

export interface ResolvedBrowserTarget {
  readonly selector: string;
  /** Present when the target was named by a ref. */
  readonly ref?: BrowserActionRef;
}

/**
 * Builds the table for a snapshot taken at `url`. Numbering never restarts within a session, so a
 * ref from an older snapshot is absent from the newer table instead of silently naming another
 * element.
 */
export function createElementRefTable(url: string, refs: readonly PageViewRef[]): ElementRefTable {
  return { url, byRef: new Map(refs.map((entry) => [entry.ref, entry])) };
}

// A name is matched exactly (the `s` flag makes the comparison case-sensitive and whole-string);
// a name the snapshot had to cut is only a prefix, so it is matched as a substring instead.
// Uniqueness is checked against the live page either way before the ref is used.
function selectorForRef(entry: PageViewRef): string {
  if (entry.name === undefined) {
    return `role=${entry.role}`;
  }
  const quoted = JSON.stringify(entry.isNameTruncated ? entry.name.slice(0, -1) : entry.name);
  return `role=${entry.role}[name=${quoted}${entry.isNameTruncated ? '' : 's'}]`;
}

function staleRef(ref: string, reason: string): QaError {
  return new QaError('BROWSER_REF_STALE', `The ref "${ref}" cannot be used: ${reason}`, {
    remediation:
      'Take a new snapshot with qa.browser_snapshot and use a ref from it, or pass a selector instead.',
  });
}

/**
 * Turns the `selector` or `ref` an action tool was given into the selector it acts on. A ref is
 * honoured only when it comes from the session's latest snapshot, the page is still the one that
 * snapshot read, and its role and name still find exactly one element; anything else is
 * `BROWSER_REF_STALE`. The returned selector is what the caller records as evidence, so a record
 * never holds a ref without the selector it stood for.
 */
export async function resolveBrowserTarget(
  session: BrowserSession,
  options: BrowserTargetOptions,
): Promise<ResolvedBrowserTarget> {
  const { selector, ref: refId } = options;
  if (selector !== undefined && refId === undefined) {
    return { selector };
  }
  if (selector !== undefined || refId === undefined) {
    throw new QaError('BROWSER_TARGET_INVALID', 'Give exactly one of "selector" and "ref"', {
      remediation: 'Pass a selector, or a ref taken from qa.browser_snapshot, but not both.',
    });
  }
  const table = session.elementRefs;
  if (table === undefined) {
    throw staleRef(refId, 'this session has no snapshot yet');
  }
  const entry = table.byRef.get(refId);
  if (entry === undefined) {
    throw staleRef(refId, 'it is not in the latest snapshot of this session');
  }
  if (session.page.url() !== table.url) {
    throw staleRef(refId, 'the page has moved on since the snapshot');
  }
  const resolved = selectorForRef(entry);
  const matches = await session.page.locator(resolved).count();
  if (matches !== 1) {
    throw staleRef(refId, `its role and name now match ${String(matches)} elements, not one`);
  }
  return {
    selector: resolved,
    ref: { id: refId, role: entry.role, ...(entry.name === undefined ? {} : { name: entry.name }) },
  };
}
