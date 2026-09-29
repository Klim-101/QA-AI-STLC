// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { describe, expect, it } from 'vitest';
import { listA11yScans } from './a11y-scan-store.js';
import { QaStore } from './qa-store.js';

const PROJECT_ROOT = join('project');
const EVIDENCE_DIR = join(PROJECT_ROOT, '.qa', 'evidence');

const SCAN_JSON = JSON.stringify({
  type: 'a11y-scan',
  axeVersion: '4.13.0',
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
  passedRuleIds: ['html-has-lang'],
  inapplicableRuleIds: [],
});

describe('listA11yScans', () => {
  it('returns each recorded scan with its evidence id, skipping other evidence', async () => {
    const fs = createFakeFileSystem({
      [join(EVIDENCE_DIR, 'run-2', 'evidence-9.json')]: SCAN_JSON,
      [join(EVIDENCE_DIR, 'run-1', 'evidence-3.json')]: SCAN_JSON,
      [join(EVIDENCE_DIR, 'run-1', 'evidence-4.json')]: JSON.stringify({ type: 'http-request' }),
      [join(EVIDENCE_DIR, 'run-1', 'evidence-5.png')]: 'not json',
      [join(EVIDENCE_DIR, 'run-1', 'evidence-6.quarantine.json')]: SCAN_JSON,
    });

    const scans = await listA11yScans(new QaStore({ projectRoot: PROJECT_ROOT, fs }));

    expect(scans.map((scan) => scan.evidenceId)).toEqual(['evidence-3', 'evidence-9']);
    expect(scans[0]?.record.passedRuleIds).toEqual(['html-has-lang']);
  });

  it('returns nothing when no evidence has been recorded', async () => {
    const store = new QaStore({ projectRoot: PROJECT_ROOT, fs: createFakeFileSystem({}) });

    expect(await listA11yScans(store)).toEqual([]);
  });
});
