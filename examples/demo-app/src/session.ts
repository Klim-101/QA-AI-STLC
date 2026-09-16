// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    csrfToken?: string;
  }
}
