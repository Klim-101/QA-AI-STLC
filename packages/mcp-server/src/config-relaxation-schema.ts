// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

/** Mirrors `@qa-ai-stlc/core`'s `ConfigRelaxation` (ADR-011), shared by `qa.doctor` and `qa.config_show`. */
export const ConfigRelaxationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('allowlist-entry'),
    environment: z.string(),
    hostname: z.string(),
    localLayerPath: z.string(),
  }),
  z.object({
    kind: z.literal('tls-insecure'),
    environment: z.string(),
    localLayerPath: z.string(),
  }),
  z.object({
    kind: z.literal('safe-non-get-request'),
    environment: z.string(),
    method: z.string(),
    path: z.string(),
    reason: z.string(),
    localLayerPath: z.string(),
  }),
]);
