// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { A11yScanRecordSchema } from '@qa-ai-stlc/schemas';
import type { A11yScanInput } from './a11y-conformance.js';
import type { QaStore } from './qa-store.js';

/**
 * Every accessibility scan recorded as evidence, across all runs, in path order. Other evidence
 * documents (browser actions, HTTP records) share the `.json` extension and are recognised by not
 * matching the scan schema, so they are skipped rather than reported as errors.
 */
export async function listA11yScans(store: QaStore): Promise<readonly A11yScanInput[]> {
  const paths = (await store.listFiles('evidence'))
    .filter((path) => path.endsWith('.json') && !path.endsWith('.quarantine.json'))
    .sort();
  const scans: A11yScanInput[] = [];
  for (const path of paths) {
    const parsed = A11yScanRecordSchema.safeParse(JSON.parse(await store.readText(path)));
    if (parsed.success) {
      const filename = path.slice(path.lastIndexOf('/') + 1);
      scans.push({ evidenceId: filename.slice(0, filename.indexOf('.')), record: parsed.data });
    }
  }
  return scans;
}
