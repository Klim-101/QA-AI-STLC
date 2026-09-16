// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { randomBytes } from 'node:crypto';
import type { Request } from 'express';
import './session.js';

// BUG-010: a token is generated and rendered into every form, but no route ever calls a
// verification function against it — the form field is decorative, so a request forged from
// another origin succeeds identically to a legitimate one.
export function ensureCsrfToken(request: Request): string {
  request.session.csrfToken ??= randomBytes(16).toString('hex');
  return request.session.csrfToken;
}
