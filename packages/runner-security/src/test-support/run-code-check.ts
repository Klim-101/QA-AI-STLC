// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { NO_IDENTITY_SESSIONS } from '../identity-sessions.js';
import type { SecurityCheck, SecurityCheckOutcome } from '../security-check.js';
import type { SourceCheckout } from '../source-checkout.js';
import { scriptedProbe, type ScriptedRequest } from './scripted-probe.js';

/** Runs a code-assisted check over a checkout; the probe is real, so a test can prove it stayed unused. */
export async function runCodeCheck(
  check: SecurityCheck,
  source: SourceCheckout | undefined,
): Promise<{ readonly outcome: SecurityCheckOutcome; readonly requests: readonly ScriptedRequest[] }> {
  const { probe, authorization, requests } = scriptedProbe(() => ({}));
  const outcome = await check.run({
    probe,
    authorization,
    identities: NO_IDENTITY_SESSIONS,
    ...(source !== undefined ? { source } : {}),
  });
  return { outcome, requests };
}
