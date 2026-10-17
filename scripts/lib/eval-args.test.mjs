// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENARIO, parseEvalArgs } from './eval-args.mjs';

const REPO = resolve('repo-root');

describe('parseEvalArgs', () => {
  it('defaults to the baseline scenario, the report folder under .eval and no project', () => {
    const options = parseEvalArgs([], REPO);

    expect(options.scenarioPath).toBe(join(REPO, 'evals', 'scenarios', `${DEFAULT_SCENARIO}.json`));
    expect(options.outputDirectory).toBe(join(REPO, '.eval', 'reports'));
    expect(options.projectDirectory).toBeUndefined();
    expect(options.port).toBe(4696);
  });

  it('takes a scenario by id or by path, a project, an output folder and a port', () => {
    const byId = parseEvalArgs(['--scenario', 'other'], REPO);
    const byPath = parseEvalArgs(['--scenario', 'mine/scenario.json'], REPO);
    const full = parseEvalArgs(['--project', 'work', '--out', 'reports', '--port', '5000'], REPO);

    expect(byId.scenarioPath).toBe(join(REPO, 'evals', 'scenarios', 'other.json'));
    expect(byPath.scenarioPath).toBe(resolve('mine/scenario.json'));
    expect(full).toMatchObject({
      projectDirectory: resolve('work'),
      outputDirectory: resolve('reports'),
      port: 5000,
    });
  });

  it('runs the baseline with 4 spokes at once unless told otherwise, and takes 1 for sequential', () => {
    expect(parseEvalArgs([], REPO)).toMatchObject({ parallelism: 4, isComparison: false });
    expect(parseEvalArgs(['--parallelism', '1', '--compare'], REPO)).toMatchObject({
      parallelism: 1,
      isComparison: true,
    });
  });

  it.each(['0', 'two', '1.5'])('rejects the parallelism "%s"', (parallelism) => {
    expect(() => parseEvalArgs(['--parallelism', parallelism], REPO)).toThrow(
      '--parallelism must be a whole number of 1 or more',
    );
  });

  it('keeps an absolute output folder as it is', () => {
    const absolute = resolve('somewhere', 'reports');

    expect(parseEvalArgs(['--out', absolute], REPO).outputDirectory).toBe(absolute);
  });

  it.each(['abc', '0', '70000', '12.5'])('rejects the port "%s"', (port) => {
    expect(() => parseEvalArgs(['--port', port], REPO)).toThrow('--port must be a port number');
  });

  it('rejects an argument it does not know', () => {
    expect(() => parseEvalArgs(['--bogus'], REPO)).toThrow();
  });
});
