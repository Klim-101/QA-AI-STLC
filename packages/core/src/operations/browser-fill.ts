// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Evidence } from '@qa-ai-stlc/schemas';
import { waitForBusyToClear } from '../browser-busy-wait.js';
import { QaError } from '../errors.js';
import { resolveBrowserTarget } from '../element-refs.js';
import type { BrowserOperationContext } from './browser-context.js';
import { createBrowserEvidenceStore, registerBrowserAction } from './browser-evidence.js';

export interface BrowserFillOptions {
  readonly sessionId: string;
  /** A Playwright selector; give this or `ref`. */
  readonly selector?: string;
  /** A ref from the latest `qa.browser_snapshot`; give this or `selector`. */
  readonly ref?: string;
  /** The text to type. Give this or `valueFromEnv`. */
  readonly value?: string;
  /**
   * Name of a `QA_`-prefixed environment variable the engine reads itself, so a credential is
   * typed without ever passing through the agent. Give this or `value`.
   */
  readonly valueFromEnv?: string;
  /** `'step-<N>'`, `N` the case step's 1-based position, during an interactive execution session (P3-15). */
  readonly stepId?: string;
}

export interface BrowserFillResult {
  readonly sessionId: string;
  readonly selector: string;
  /** How much was typed. The value itself never leaves the browser (AGENTS.md 5.8). */
  readonly valueLength: number;
  readonly url: string;
  readonly evidence: Evidence;
}

const ENV_NAME_PREFIX = 'QA_';

// The messages name the variable, never its value (AGENTS.md 5.8).
function resolveFillValue(
  env: Readonly<Record<string, string | undefined>>,
  options: BrowserFillOptions,
): string {
  if ((options.value === undefined) === (options.valueFromEnv === undefined)) {
    throw new QaError('BROWSER_FILL_VALUE_AMBIGUOUS', 'Give exactly one of "value" and "valueFromEnv"', {
      remediation: 'Pass the text as "value", or the name of a QA_ environment variable as "valueFromEnv".',
    });
  }
  if (options.value !== undefined) {
    return options.value;
  }
  const name = options.valueFromEnv ?? '';
  if (!name.startsWith(ENV_NAME_PREFIX)) {
    throw new QaError(
      'BROWSER_FILL_ENV_NAME_INVALID',
      `"${name}" is not a ${ENV_NAME_PREFIX}* environment variable name`,
      { remediation: `Only variables whose name starts with ${ENV_NAME_PREFIX} can be typed into a field.` },
    );
  }
  const value = env[name];
  if (value === undefined || value === '') {
    throw new QaError('BROWSER_FILL_ENV_UNSET', `Environment variable "${name}" is not set`, {
      remediation: `Ask the operator to set ${name} before the engine process starts; do not look for its value.`,
    });
  }
  return value;
}

/**
 * MCP `qa.browser_fill` (P2-06): types into one field and registers the fill as evidence. The
 * record names the field and the length of what was typed, never the value: a password typed
 * into a login form must not survive in `.qa/` even though the evidence store's secret scanner
 * would probably have caught it — defense in depth (AGENTS.md 5.8, 12.4).
 */
export async function runBrowserFill(
  context: BrowserOperationContext,
  options: BrowserFillOptions,
): Promise<BrowserFillResult> {
  const value = resolveFillValue(context.engine.env, options);
  const session = await context.sessions.get(options.sessionId);
  const evidenceStore = createBrowserEvidenceStore(context.engine);
  const target = await resolveBrowserTarget(session, options);

  await waitForBusyToClear(session);
  await session.page.fill(target.selector, value, { timeout: session.actionTimeoutMs });
  await waitForBusyToClear(session);
  const url = session.page.url();

  const evidence = await registerBrowserAction({
    evidenceStore,
    evidenceId: context.sessions.nextEvidenceId(),
    session,
    now: context.engine.clock.now(),
    action: {
      type: 'fill',
      selector: target.selector,
      ...(target.ref === undefined ? {} : { ref: target.ref }),
      valueLength: value.length,
      url,
    },
    ...(options.stepId !== undefined ? { stepId: options.stepId } : {}),
  });

  return {
    sessionId: session.sessionId,
    selector: target.selector,
    valueLength: value.length,
    url,
    evidence,
  };
}
