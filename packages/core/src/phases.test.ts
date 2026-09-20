// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { PhaseNameSchema } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { PHASES } from './phases.js';

describe('PHASES', () => {
  it('lists every phase PhaseNameSchema declares, in order, with none missing or extra', () => {
    expect(PHASES).toEqual(PhaseNameSchema.options);
  });
});
