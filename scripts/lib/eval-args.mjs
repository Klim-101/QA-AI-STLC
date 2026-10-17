// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { isAbsolute, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

export const DEFAULT_SCENARIO = 'baseline-demo-app';
export const DEFAULT_PORT = 4696;

/**
 * Reads the arguments of `npm run eval`: `--scenario <id or path>`, `--project <dir>` to score a
 * project a real agent worked in instead of running the scripted baseline, `--out <dir>` for the
 * reports, `--port <n>` for the demo app. Throws an `Error` with the reason on a bad argument.
 */
export function parseEvalArgs(argv, repoRoot) {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      scenario: { type: 'string' },
      project: { type: 'string' },
      out: { type: 'string' },
      port: { type: 'string' },
    },
    strict: true,
  });
  const scenario = values.scenario ?? DEFAULT_SCENARIO;
  const port = values.port === undefined ? DEFAULT_PORT : Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`--port must be a port number, not "${values.port}".`);
  }
  return {
    scenarioPath: scenario.endsWith('.json')
      ? resolve(scenario)
      : join(repoRoot, 'evals', 'scenarios', `${scenario}.json`),
    projectDirectory: values.project === undefined ? undefined : resolve(values.project),
    outputDirectory:
      values.out === undefined
        ? join(repoRoot, '.eval', 'reports')
        : isAbsolute(values.out)
          ? values.out
          : resolve(values.out),
    port,
  };
}
