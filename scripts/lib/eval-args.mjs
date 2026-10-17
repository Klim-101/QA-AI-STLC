// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { isAbsolute, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

export const DEFAULT_SCENARIO = 'baseline-demo-app';
export const DEFAULT_PORT = 4696;
export const DEFAULT_PARALLELISM = 4;

/**
 * Reads the arguments of `npm run eval`: `--scenario <id or path>`, `--project <dir>` to score a
 * project a real agent worked in instead of running the scripted baseline, `--out <dir>` for the
 * reports, `--port <n>` for the demo app, `--parallelism <n>` for the spokes the baseline dispatches
 * at once (1 is sequential), and `--compare` to run it sequentially and in parallel and set the two
 * side by side. Throws an `Error` with the reason on a bad argument.
 */
export function parseEvalArgs(argv, repoRoot) {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      scenario: { type: 'string' },
      project: { type: 'string' },
      out: { type: 'string' },
      port: { type: 'string' },
      parallelism: { type: 'string' },
      compare: { type: 'boolean', default: false },
    },
    strict: true,
  });
  const scenario = values.scenario ?? DEFAULT_SCENARIO;
  const port = values.port === undefined ? DEFAULT_PORT : Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`--port must be a port number, not "${values.port}".`);
  }
  const parallelism = values.parallelism === undefined ? DEFAULT_PARALLELISM : Number(values.parallelism);
  if (!Number.isInteger(parallelism) || parallelism < 1) {
    throw new Error(`--parallelism must be a whole number of 1 or more, not "${values.parallelism}".`);
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
    parallelism,
    isComparison: values.compare,
  };
}
