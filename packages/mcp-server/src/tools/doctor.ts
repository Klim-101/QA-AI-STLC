// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runDoctor } from '@qa-ai-stlc/core';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  fix: z.boolean().optional().describe('Install missing browsers through Playwright before reporting.'),
});

const DoctorCheckSchema = z.object({
  name: z.string(),
  status: z.enum(['pass', 'fail']),
  message: z.string(),
  remediation: z.string().optional(),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  checks: z.array(DoctorCheckSchema),
});

/**
 * `qa.doctor` (P2-05): the same `runDoctor` core call `qa doctor` uses — Node version, browser
 * binaries, and, once `config.yaml` exists, every identity's secret and environment's
 * reachability (ADR-004).
 */
export const doctorTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.doctor',
  description:
    'Checks the local environment the engine needs: Node version, browser binaries, and, once ' +
    'config.yaml exists, every configured identity secret and environment URL. Use before ' +
    'qa.explore to confirm the project is set up correctly. Set fix to install missing browsers.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler(input) {
    const report = await runDoctor(createNodeEngineContext(), {
      ...(input.fix !== undefined ? { fix: input.fix } : {}),
    });
    return { ok: report.ok, checks: [...report.checks] };
  },
};
