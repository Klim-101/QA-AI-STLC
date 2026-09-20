// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { PhaseName } from '@qa-ai-stlc/schemas';

// The v0 pipeline order (development plan section 2.7, 8: scope before cases). Typed as a
// non-empty tuple so `PHASES[0]`/`PHASES[PHASES.length - 1]` stay `PhaseName`, not
// `PhaseName | undefined`, under `noUncheckedIndexedAccess`. The `PhaseName` annotation catches a
// typo or a renamed phase at compile time; `state.test.ts`/`gate.test.ts` catch this list falling
// out of sync with every member `PhaseNameSchema` (packages/schemas) actually declares.
export const PHASES: readonly [PhaseName, ...PhaseName[]] = ['scope', 'cases'];
