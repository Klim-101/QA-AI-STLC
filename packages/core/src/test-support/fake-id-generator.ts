// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { IdGenerator } from '../ports/id-generator.js';

/** A deterministic `IdGenerator` for tests: `prefix-1`, `prefix-2`, and so on (AGENTS.md 12.6). */
export function createSequentialIdGenerator(prefix: string): IdGenerator {
  let counter = 0;
  return {
    next: () => {
      counter += 1;
      return `${prefix}-${String(counter)}`;
    },
  };
}
