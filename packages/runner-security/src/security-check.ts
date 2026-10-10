// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type {
  SecurityAuthorization,
  SecurityCheckClass,
  SecurityCheckStatus,
  SecurityFinding,
} from '@qa-ai-stlc/schemas';
import type { IdentitySessions } from './identity-sessions.js';
import type { SecurityProbe } from './security-probe.js';

export interface SecurityCheckInput {
  /** The only way a check reaches the application; every authorized limit is enforced inside it. */
  readonly probe: SecurityProbe;
  readonly authorization: SecurityAuthorization;
  /** The identities the authorization names, signed in; empty when it names none. */
  readonly identities: IdentitySessions;
}

export interface SecurityCheckOutcome {
  /**
   * `passed` only when the check looked and found nothing. A check that could not look says
   * `skipped` (not applicable or not enough authorization) or `blocked` (something stopped it),
   * and one unsure of what it saw says `uncertain`: none of these is ever reported as `passed`.
   */
  readonly status: Exclude<SecurityCheckStatus, 'failed'>;
  readonly note?: string;
  /** Any finding makes the check `failed`, whatever `status` says. */
  readonly findings: readonly SecurityFinding[];
}

/** One class of black-box checks (development plan 2.7), run through the probe. */
export interface SecurityCheck {
  readonly checkClass: SecurityCheckClass;
  run(input: SecurityCheckInput): Promise<SecurityCheckOutcome>;
}
