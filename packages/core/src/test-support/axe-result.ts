// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { DEFAULT_A11Y_CONFIG } from '@qa-ai-stlc/schemas';
import { planAxeRun } from '../operations/a11y-scan-plan.js';

// The rule tags of the default target (WCAG 2.1 AA).
export const DEFAULT_AXE_TAGS: readonly string[] = planAxeRun(DEFAULT_A11Y_CONFIG).tags;

interface AxeEntry {
  readonly id: string;
  readonly [key: string]: unknown;
}

export interface AxeResultParts {
  readonly violations?: readonly AxeEntry[];
  readonly incomplete?: readonly AxeEntry[];
  readonly passes?: readonly AxeEntry[];
  readonly inapplicable?: readonly AxeEntry[];
  /** The rule tags axe-core echoes in `toolOptions`; the default target's when omitted. */
  readonly tags?: readonly string[];
}

/** A complete axe-core result in the shape `axe.run` returns, so tests exercise the real contract. */
export function axeResult(parts: AxeResultParts = {}): Record<string, unknown> {
  return {
    testEngine: { name: 'axe-core', version: '4.0.0' },
    url: 'https://staging.example.test/login',
    toolOptions: { runOnly: { type: 'tag', values: parts.tags ?? DEFAULT_AXE_TAGS } },
    violations: parts.violations ?? [],
    incomplete: parts.incomplete ?? [],
    passes: parts.passes ?? [],
    inapplicable: parts.inapplicable ?? [],
  };
}
