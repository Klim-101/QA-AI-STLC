// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { BrowserWait, BrowserWaitCondition, Evidence } from '@qa-ai-stlc/schemas';
import { waitForBusyToClear } from '../browser-busy-wait.js';
import { sleepInPage } from '../browser-expect-page.js';
import { resolveBrowserTarget } from '../element-refs.js';
import { QaError } from '../errors.js';
import { judgeExpectation, type ExpectationSpec, type PageObservation } from '../expectation.js';
import { DEFAULT_NORMALIZE_LIMITS, truncateText } from '../normalize.js';
import type { BrowserOperationContext } from './browser-context.js';
import { createBrowserEvidenceStore, registerBrowserAction } from './browser-evidence.js';
import { EXPECTATION_POLL_INTERVAL_MS, observeExpectationTarget } from './browser-expect.js';

export interface BrowserWaitForOptions {
  readonly sessionId: string;
  readonly condition: BrowserWaitCondition;
  /** A Playwright selector; element conditions take this or `ref`, text conditions may scope to it, `url` takes neither. */
  readonly selector?: string;
  /** A ref from the latest `qa.browser_snapshot`; the same conditions take this or `selector`. */
  readonly ref?: string;
  /** The text or URL to wait for; required by `text-appears`, `text-disappears` and `url`. */
  readonly expected?: string;
  /** Compares text or a URL in full instead of by containment. */
  readonly exact?: boolean;
  /** How long to wait; at most the session's action timeout, which is also the default. */
  readonly timeoutMs?: number;
  /** `'step-<N>'`, `N` the case step's 1-based position, during an interactive execution session (P3-15). */
  readonly stepId?: string;
}

export interface BrowserWaitForResult {
  readonly sessionId: string;
  readonly condition: BrowserWaitCondition;
  readonly selector?: string;
  /** How long it took until the condition held, in milliseconds. */
  readonly waitedMs: number;
  readonly url: string;
  readonly evidence: Evidence;
}

function invalid(message: string): QaError {
  return new QaError('BROWSER_WAIT_INVALID', message, {
    remediation: 'See the qa.browser_wait_for description for what each condition takes.',
  });
}

interface WaitPlan {
  /** What one look at the page must show for the condition to hold. */
  readonly spec: ExpectationSpec;
  readonly isMet: (observation: PageObservation) => boolean;
  /** The element to look at; text conditions fall back to the whole page. */
  readonly needsTarget: boolean;
  readonly canScopeToTarget: boolean;
}

function planWait(options: BrowserWaitForOptions): WaitPlan {
  const { condition, expected } = options;
  const exact = options.exact ?? false;
  const requiresText = condition === 'text-appears' || condition === 'text-disappears' || condition === 'url';
  if (requiresText && (typeof expected !== 'string' || expected === '')) {
    throw invalid(`"${condition}" needs "expected" as a non-empty string`);
  }
  if (!requiresText && expected !== undefined) {
    throw invalid(`"${condition}" takes no "expected"`);
  }
  switch (condition) {
    case 'visible':
    case 'hidden': {
      const spec: ExpectationSpec = { kind: condition, exact };
      return {
        spec,
        isMet: (observation) => judgeExpectation(spec, observation).passed,
        needsTarget: true,
        canScopeToTarget: true,
      };
    }
    case 'attached':
      return {
        spec: { kind: 'count', exact },
        isMet: (observation) => observation.matchCount > 0,
        needsTarget: true,
        canScopeToTarget: true,
      };
    case 'detached':
      return {
        spec: { kind: 'count', exact },
        isMet: (observation) => observation.matchCount === 0,
        needsTarget: true,
        canScopeToTarget: true,
      };
    case 'text-appears': {
      const spec: ExpectationSpec = { kind: 'text', expected: String(expected), exact };
      return {
        spec,
        isMet: (observation) => judgeExpectation(spec, observation).passed,
        needsTarget: false,
        canScopeToTarget: true,
      };
    }
    case 'text-disappears': {
      const spec: ExpectationSpec = { kind: 'text', expected: String(expected), exact };
      // A scope that is gone has no text left; a scope that matches several elements is not a
      // place the text can be said to have left, so it keeps waiting rather than guessing.
      return {
        spec,
        isMet: (observation) =>
          observation.matchCount === 0 ||
          (observation.element !== undefined && !judgeExpectation(spec, observation).passed),
        needsTarget: false,
        canScopeToTarget: true,
      };
    }
    case 'url': {
      const spec: ExpectationSpec = { kind: 'url', expected: String(expected), exact };
      return {
        spec,
        isMet: (observation) => judgeExpectation(spec, observation).passed,
        needsTarget: false,
        canScopeToTarget: false,
      };
    }
  }
}

/**
 * MCP `qa.browser_wait_for` (P6-58): waits until a condition holds on the page (an element visible,
 * hidden, attached or detached, text appeared or gone, the URL matching) and registers what it
 * waited for and how long it took. Bounded by the session's action timeout; a condition that never
 * holds is `BROWSER_WAIT_TIMEOUT` naming it and registers nothing, so a record never vouches for
 * something the page did not do.
 */
export async function runBrowserWaitFor(
  context: BrowserOperationContext,
  options: BrowserWaitForOptions,
): Promise<BrowserWaitForResult> {
  const session = await context.sessions.get(options.sessionId);
  const plan = planWait(options);
  const hasTarget = options.selector !== undefined || options.ref !== undefined;
  if (hasTarget && !plan.canScopeToTarget) {
    throw new QaError(
      'BROWSER_TARGET_INVALID',
      `"${options.condition}" waits on the page and takes no selector or ref`,
      {
        remediation: 'Leave selector and ref out when waiting for a URL.',
      },
    );
  }
  const target = hasTarget
    ? await resolveBrowserTarget(session, { selector: options.selector, ref: options.ref })
    : undefined;
  if (target === undefined && plan.needsTarget) {
    throw new QaError('BROWSER_TARGET_INVALID', `"${options.condition}" needs a selector or a ref`, {
      remediation: 'Pass a selector, or a ref taken from qa.browser_snapshot.',
    });
  }
  // A text wait without a scope reads the whole page through its body.
  const observedSelector = options.condition === 'url' ? undefined : (target?.selector ?? 'body');
  const evidenceStore = createBrowserEvidenceStore(context.engine);
  const timeoutMs = Math.min(options.timeoutMs ?? session.actionTimeoutMs, session.actionTimeoutMs);

  await waitForBusyToClear(session);
  const startedAt = context.engine.clock.now().getTime();
  let observation = await observeExpectationTarget(session, plan.spec, observedSelector);
  for (
    let attempt = 0;
    !plan.isMet(observation) && attempt < timeoutMs / EXPECTATION_POLL_INTERVAL_MS;
    attempt += 1
  ) {
    await session.page.evaluate(sleepInPage, EXPECTATION_POLL_INTERVAL_MS);
    observation = await observeExpectationTarget(session, plan.spec, observedSelector);
  }
  const waitedMs = Math.max(0, context.engine.clock.now().getTime() - startedAt);
  if (!plan.isMet(observation)) {
    const subject = target === undefined ? '' : ` on "${target.selector}"`;
    const expectedText =
      options.expected === undefined
        ? ''
        : ` "${truncateText(options.expected, DEFAULT_NORMALIZE_LIMITS).text}"`;
    throw new QaError(
      'BROWSER_WAIT_TIMEOUT',
      `Waited ${String(timeoutMs)} ms for "${options.condition}"${expectedText}${subject}; the page is at ${observation.url} and matched ${String(observation.matchCount)} element(s)`,
      {
        remediation:
          'Check the condition and selector against the page with qa.browser_snapshot; a slow page may need a longer environment actionTimeoutMs.',
      },
    );
  }

  const wait: BrowserWait = {
    condition: options.condition,
    ...(options.expected === undefined
      ? {}
      : { expected: truncateText(options.expected, DEFAULT_NORMALIZE_LIMITS).text }),
    waitedMs,
  };
  const evidence = await registerBrowserAction({
    evidenceStore,
    evidenceId: context.sessions.nextEvidenceId(),
    session,
    now: context.engine.clock.now(),
    action: {
      type: 'wait-for',
      url: observation.url,
      ...(target === undefined ? {} : { selector: target.selector }),
      ...(target?.ref === undefined ? {} : { ref: target.ref }),
      wait,
    },
    ...(options.stepId !== undefined ? { stepId: options.stepId } : {}),
  });

  return {
    sessionId: session.sessionId,
    condition: options.condition,
    ...(target === undefined ? {} : { selector: target.selector }),
    waitedMs,
    url: observation.url,
    evidence,
  };
}
