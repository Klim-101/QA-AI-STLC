// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { BrowserExpectation, BrowserExpectationKind, Evidence } from '@qa-ai-stlc/schemas';
import { waitForBusyToClear } from '../browser-busy-wait.js';
import { readElementState, sleepInPage } from '../browser-expect-page.js';
import type { BrowserSession } from '../browser-session-store.js';
import { resolveBrowserTarget } from '../element-refs.js';
import { QaError } from '../errors.js';
import {
  ElementReadingSchema,
  judgeExpectation,
  type ExpectationSpec,
  type ExpectationValue,
  type ExpectationVerdict,
  type PageObservation,
} from '../expectation.js';
import { DEFAULT_NORMALIZE_LIMITS, truncateText } from '../normalize.js';
import type { BrowserOperationContext } from './browser-context.js';
import { createBrowserEvidenceStore, registerBrowserAction } from './browser-evidence.js';

export const EXPECTATION_POLL_INTERVAL_MS = 100;
/** An element that was just counted is read at once; this only bounds the case where it vanished. */
const ELEMENT_READ_TIMEOUT_MS = 1_000;
const REDACTED = '[redacted]';

export interface BrowserExpectOptions {
  readonly sessionId: string;
  readonly kind: BrowserExpectationKind;
  /** A Playwright selector; every kind but `url` takes this or `ref`. */
  readonly selector?: string;
  /** A ref from the latest `qa.browser_snapshot`; every kind but `url` takes this or `selector`. */
  readonly ref?: string;
  /** The text, value, count or URL expected, or whether the box is checked (default true). */
  readonly expected?: ExpectationValue;
  /** Compares text or a URL in full instead of by containment. */
  readonly exact?: boolean;
  /** How long to keep looking; at most the session's action timeout, which is also the default. */
  readonly timeoutMs?: number;
  /** `'step-<N>'`, `N` the case step's 1-based position, during an interactive execution session (P3-15). */
  readonly stepId?: string;
}

export interface BrowserExpectResult {
  readonly sessionId: string;
  readonly kind: BrowserExpectationKind;
  readonly selector?: string;
  readonly passed: boolean;
  readonly expected?: ExpectationValue;
  /** What the page showed on the last look; text is capped. */
  readonly observed?: ExpectationValue;
  readonly matchCount?: number;
  readonly url: string;
  readonly evidence: Evidence;
}

function invalid(message: string): QaError {
  return new QaError('BROWSER_EXPECT_INVALID', message, {
    remediation: 'See the qa.browser_expect description for what each kind takes.',
  });
}

/** Checks the options against the kind and returns the spec the verdict is judged by. */
function toSpec(options: BrowserExpectOptions): ExpectationSpec {
  const { kind, expected } = options;
  const exact = options.exact ?? false;
  switch (kind) {
    case 'visible':
    case 'hidden':
      if (expected !== undefined) {
        throw invalid(`"${kind}" takes no "expected"`);
      }
      return { kind, exact };
    case 'text':
    case 'value':
    case 'url':
      if (typeof expected !== 'string') {
        throw invalid(`"${kind}" needs "expected" as a string`);
      }
      return { kind, expected, exact };
    case 'count':
      if (typeof expected !== 'number' || !Number.isInteger(expected) || expected < 0) {
        throw invalid('"count" needs "expected" as a whole number, zero or more');
      }
      return { kind, expected, exact };
    case 'checked':
      if (expected !== undefined && typeof expected !== 'boolean') {
        throw invalid('"checked" needs "expected" as true or false');
      }
      return { kind, expected: expected ?? true, exact };
  }
}

/** Looks once at the page for what an expectation reads; shared with qa.browser_wait_for. */
export async function observeExpectationTarget(
  session: BrowserSession,
  spec: ExpectationSpec,
  selector: string | undefined,
): Promise<PageObservation> {
  const url = session.page.url();
  if (selector === undefined) {
    return { url, matchCount: 0 };
  }
  const locator = session.page.locator(selector);
  const matchCount = await locator.count();
  const readsElement = spec.kind !== 'count';
  if (!readsElement || matchCount !== 1) {
    return { url, matchCount };
  }
  let answer: unknown;
  try {
    answer = await locator.evaluate(readElementState, undefined, {
      timeout: Math.min(session.actionTimeoutMs, ELEMENT_READ_TIMEOUT_MS),
    });
  } catch {
    // The element was counted a moment ago, so a read that cannot find it means the page removed
    // it in between; that is an element that is gone, which the next look reports, not a failure.
    return { url, matchCount };
  }
  const reading = ElementReadingSchema.safeParse(answer);
  // A page that answers with something unexpected is not read as an element that matched.
  return reading.success ? { url, matchCount, element: reading.data } : { url, matchCount };
}

function capped(value: ExpectationValue | undefined): ExpectationValue | undefined {
  return typeof value === 'string' ? truncateText(value, DEFAULT_NORMALIZE_LIMITS).text : value;
}

/**
 * MCP `qa.browser_expect` (P6-55): checks one expectation against the live page, looking again
 * until it holds or the wait runs out, and registers what the page showed with the engine's
 * verdict. A failed expectation is an observation and is registered like a passed one; only a
 * misuse of the tool throws. The value of a password field is never recorded.
 */
export async function runBrowserExpect(
  context: BrowserOperationContext,
  options: BrowserExpectOptions,
): Promise<BrowserExpectResult> {
  const session = await context.sessions.get(options.sessionId);
  const spec = toSpec(options);
  if (spec.kind === 'url' && (options.selector !== undefined || options.ref !== undefined)) {
    throw new QaError('BROWSER_TARGET_INVALID', '"url" checks the page and takes no selector or ref', {
      remediation: 'Leave selector and ref out when expecting a URL.',
    });
  }
  const target =
    spec.kind === 'url'
      ? undefined
      : await resolveBrowserTarget(session, { selector: options.selector, ref: options.ref });
  const evidenceStore = createBrowserEvidenceStore(context.engine);
  const timeoutMs = Math.min(options.timeoutMs ?? session.actionTimeoutMs, session.actionTimeoutMs);

  await waitForBusyToClear(session);
  let observation = await observeExpectationTarget(session, spec, target?.selector);
  let verdict: ExpectationVerdict = judgeExpectation(spec, observation);
  for (let attempt = 0; !verdict.passed && attempt < timeoutMs / EXPECTATION_POLL_INTERVAL_MS; attempt += 1) {
    await session.page.evaluate(sleepInPage, EXPECTATION_POLL_INTERVAL_MS);
    observation = await observeExpectationTarget(session, spec, target?.selector);
    verdict = judgeExpectation(spec, observation);
  }

  const isSecret = spec.kind === 'value' && observation.element?.inputType === 'password';
  const expected = isSecret ? REDACTED : capped(spec.expected);
  const observed = isSecret && verdict.observed !== undefined ? REDACTED : capped(verdict.observed);
  const expectation: BrowserExpectation = {
    kind: spec.kind,
    passed: verdict.passed,
    ...(expected === undefined ? {} : { expected }),
    ...(observed === undefined ? {} : { observed }),
    ...(spec.kind === 'url' ? {} : { matchCount: observation.matchCount }),
  };
  const evidence = await registerBrowserAction({
    evidenceStore,
    evidenceId: context.sessions.nextEvidenceId(),
    session,
    now: context.engine.clock.now(),
    action: {
      type: 'expect',
      url: observation.url,
      ...(target === undefined ? {} : { selector: target.selector }),
      ...(target?.ref === undefined ? {} : { ref: target.ref }),
      expectation,
    },
    ...(options.stepId !== undefined ? { stepId: options.stepId } : {}),
  });

  return {
    sessionId: session.sessionId,
    kind: spec.kind,
    ...(target === undefined ? {} : { selector: target.selector }),
    passed: verdict.passed,
    ...(expected === undefined ? {} : { expected }),
    ...(observed === undefined ? {} : { observed }),
    ...(expectation.matchCount === undefined ? {} : { matchCount: expectation.matchCount }),
    url: observation.url,
    evidence,
  };
}
