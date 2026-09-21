// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from 'node:crypto';

/**
 * A source of fresh, unique identifiers, injected for the same reason `Clock` is: a session id,
 * a run id or an evidence id that came from real randomness makes an artifact impossible to
 * assert on (AGENTS.md 5.3, 12.6).
 */
export interface IdGenerator {
  next(): string;
}

export const randomIdGenerator: IdGenerator = {
  next: () => randomUUID(),
};
