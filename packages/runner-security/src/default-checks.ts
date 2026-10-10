// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { cookiesCheck } from './checks/cookies-check.js';
import { corsCheck } from './checks/cors-check.js';
import { encodingCheck } from './checks/encoding-check.js';
import { errorsCheck } from './checks/errors-check.js';
import { headersCheck } from './checks/headers-check.js';
import type { SecurityCheck } from './security-check.js';

/** Every check this version implements. A class the authorization lists but is absent here is reported `skipped`. */
export const DEFAULT_SECURITY_CHECKS: readonly SecurityCheck[] = [
  headersCheck,
  cookiesCheck,
  corsCheck,
  errorsCheck,
  encodingCheck,
];
