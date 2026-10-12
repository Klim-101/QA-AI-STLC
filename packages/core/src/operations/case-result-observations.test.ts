// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { QaStore } from '../qa-store.js';
import { readCitedObservations } from './case-result-observations.js';

const PROJECT_ROOT = join('project');

function evidencePath(file: string): string {
  return join(PROJECT_ROOT, '.qa', 'evidence', 'run-1', file);
}

const ACTION = { type: 'click', sessionId: 'session-1', at: '2026-09-25T09:59:30.000Z' };
const REQUEST = {
  type: 'http-request',
  stepId: 'step-2',
  method: 'GET',
  url: 'https://staging.example.test/x',
  status: 200,
  responseHeaders: {},
  bodyPreview: '',
  truncated: false,
  at: '2026-09-25T09:59:30.000Z',
};
const SCAN = {
  type: 'a11y-scan',
  axeVersion: '4.0.0',
  configHash: 'a'.repeat(64),
  wcagVersion: '2.1',
  level: 'AA',
  bestPractices: false,
  tags: [],
  include: [],
  exclude: [],
  violations: [],
  excepted: [],
  expiredExceptions: [],
  uncertain: [],
  passedRuleIds: [],
  inapplicableRuleIds: [],
};

describe('readCitedObservations', () => {
  it('reads each kind of record the engine registers, with the step it is linked to', async () => {
    const store = new QaStore({
      projectRoot: PROJECT_ROOT,
      fs: createFakeFileSystem({
        [evidencePath('evidence-1.json')]: JSON.stringify({ ...ACTION, stepId: 'step-1' }),
        [evidencePath('evidence-2.json')]: JSON.stringify(REQUEST),
        [evidencePath('evidence-3.json')]: JSON.stringify({ ...SCAN, stepId: 'step-3' }),
        [evidencePath('evidence-4.json')]: JSON.stringify(ACTION),
        [evidencePath('evidence-5.json')]: JSON.stringify(SCAN),
      }),
    });

    const observations = await readCitedObservations(store, 'run-1', [
      'evidence-1',
      'evidence-2',
      'evidence-3',
      'evidence-4',
      'evidence-5',
    ]);

    expect(observations.map((observation) => [observation.source, observation.stepId])).toEqual([
      ['action', 'step-1'],
      ['http', 'step-2'],
      ['scan', 'step-3'],
      ['action', undefined],
      ['scan', undefined],
    ]);
  });

  it('keeps a request that has no step id', async () => {
    const withoutStep = Object.fromEntries(Object.entries(REQUEST).filter(([key]) => key !== 'stepId'));
    const store = new QaStore({
      projectRoot: PROJECT_ROOT,
      fs: createFakeFileSystem({ [evidencePath('evidence-1.json')]: JSON.stringify(withoutStep) }),
    });

    const [observation] = await readCitedObservations(store, 'run-1', ['evidence-1']);

    expect(observation).toMatchObject({ source: 'http' });
    expect(observation).not.toHaveProperty('stepId');
  });

  it('skips an id with no file, a file that is not JSON and JSON the engine never writes', async () => {
    const store = new QaStore({
      projectRoot: PROJECT_ROOT,
      fs: createFakeFileSystem({
        [evidencePath('evidence-1.json')]: 'not json',
        [evidencePath('evidence-2.json')]: JSON.stringify({ unrelated: true }),
        [evidencePath('evidence-3.png')]: 'bytes',
      }),
    });

    await expect(
      readCitedObservations(store, 'run-1', ['evidence-1', 'evidence-2', 'evidence-3', 'evidence-9']),
    ).resolves.toEqual([]);
  });
});
