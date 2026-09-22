// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { ApiSurfaceSchema } from './api-surface.js';
import { ApprovalLedgerSchema } from './approval-ledger.js';
import { ConfigSchema } from './config.js';
import { DefectDraftSchema } from './defect.js';
import { BrowserActionSchema, EvidenceSchema } from './evidence.js';
import { ManifestSchema } from './manifest.js';
import { MissingTestIdReportSchema } from './missing-test-id-report.js';
import { PageModelSetSchema } from './page-model.js';
import { RcaSchema } from './rca.js';
import { RouteMapSchema } from './route-map.js';
import { RunResultSchema } from './run-result.js';
import { ScopeSchema } from './scope.js';
import { SelectorRegistrySchema } from './selector-registry.js';
import { PipelineStateSchema } from './state.js';
import { TestCaseSchema } from './test-case.js';
import { TestDataSchema } from './test-data.js';

// One entry per artifact kind under `.qa/` (development plan section 3.2). This is the single
// source `scripts/generate-json-schema.mjs` walks to emit `dist/json-schema/<name>.json`; adding
// a new artifact kind means adding it here, not teaching the generator a new naming heuristic.
export const artifactSchemas = {
  config: ConfigSchema,
  scope: ScopeSchema,
  'route-map': RouteMapSchema,
  'page-models': PageModelSetSchema,
  'test-case': TestCaseSchema,
  'test-data': TestDataSchema,
  'run-result': RunResultSchema,
  evidence: EvidenceSchema,
  'browser-action': BrowserActionSchema,
  'defect-draft': DefectDraftSchema,
  rca: RcaSchema,
  'selector-registry': SelectorRegistrySchema,
  'missing-test-id-report': MissingTestIdReportSchema,
  'api-surface': ApiSurfaceSchema,
  'approval-ledger': ApprovalLedgerSchema,
  manifest: ManifestSchema,
  state: PipelineStateSchema,
} as const;
export type ArtifactKind = keyof typeof artifactSchemas;
