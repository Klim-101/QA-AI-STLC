// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { A11yConformanceReport } from '../a11y-conformance.js';

export const A11Y_CONFORMANCE_REPORT: A11yConformanceReport = {
  wcagVersion: '2.1',
  level: 'A',
  scanCount: 2,
  ignoredScanCount: 1,
  criteria: [
    {
      criterionId: '1.1.1',
      name: 'Text alternatives',
      level: 'A',
      coverage: 'partial',
      status: 'excepted',
      evidenceIds: ['evidence-1'],
    },
    {
      criterionId: '1.2.1',
      name: 'Audio-only and video-only alternatives',
      level: 'A',
      coverage: 'manual',
      status: 'needs-manual-check',
      evidenceIds: [],
    },
    {
      criterionId: '2.4.2',
      name: 'Descriptive page title',
      level: 'A',
      coverage: 'partial',
      status: 'failed',
      evidenceIds: ['evidence-1', 'evidence-2'],
    },
    {
      criterionId: '3.1.1',
      name: 'Page language declared',
      level: 'A',
      coverage: 'automated',
      status: 'passed',
      evidenceIds: ['evidence-1', 'evidence-2'],
    },
    {
      criterionId: '4.1.2',
      name: 'Name, role and value exposed',
      level: 'A',
      coverage: 'automated',
      status: 'not-applicable',
      evidenceIds: ['evidence-2'],
    },
  ],
  counts: { passed: 1, failed: 1, 'needs-manual-check': 1, 'not-applicable': 1, excepted: 1 },
};
