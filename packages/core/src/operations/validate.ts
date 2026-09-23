// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  SCHEMA_VERSION,
  ScopeSchema,
  TestCaseSchema,
  TestDataSchema,
  type Identifier,
  type PhaseName,
  type PipelineState,
  type RelativePath,
  type Scope,
  type TestCase,
} from '@qa-ai-stlc/schemas';
import { ApprovalLedgerStore, APPROVAL_LEDGER_PATH } from '../approval-ledger-store.js';
import { loadConfig } from '../config-loader.js';
import type { EngineContext } from '../engine-context.js';
import { GateStateMachine } from '../gate.js';
import { ManifestStore } from '../manifest-store.js';
import { PHASES } from '../phases.js';
import { QaStore } from '../qa-store.js';
import { findUnlinkedRequirementIds } from '../requirement-linking.js';
import { PipelineStateStore } from '../state-store.js';
import { findUnresolvedTestDataRefs } from '../test-data-linking.js';
import { checkCaseSetCompleteness, type CaseSetTypeStatus } from '../testing-scope.js';

const SCOPE_PATH = 'artifacts/scope.json';
const CASES_DIR = 'artifacts/cases';
const TEST_DATA_DIR = 'artifacts/test-data';

export interface UnlinkedCase {
  readonly casePath: string;
  readonly id: string;
  readonly unlinkedRequirementIds: readonly string[];
}

export interface UnresolvedTestDataCase {
  readonly casePath: string;
  readonly id: string;
  readonly unresolvedTestDataRefs: readonly string[];
}

export interface ValidateReport {
  readonly state: PipelineState;
  /**
   * Phases with a recorded approval whose artifact no longer matches it — real tampering or an
   * edit after approval, distinct from a phase that was simply never approved yet (also reported
   * as `open`, but not here, and not a failure).
   */
  readonly reopened: readonly PhaseName[];
  /** Every registered test case with at least one `requirementIds` entry not in the scope artifact. */
  readonly unlinkedCases: readonly UnlinkedCase[];
  /**
   * Every registered test case with at least one `testDataRefs` (P2-22) entry not in a registered
   * `TestDataSchema` set — `qa cases add` cannot check this at registration time the way it checks
   * `requirementIds`, since a case may be registered before or after the test-data sets it
   * references.
   */
  readonly unresolvedTestData: readonly UnresolvedTestDataCase[];
  /**
   * Every path in `manifest.json` whose file is missing or no longer matches its registered hash
   * (P2-07, `.qa/` integrity) — a hand-edited or deleted artifact, distinct from the approval-bound
   * tampering `reopened` already reports.
   */
  readonly tamperedArtifacts: readonly RelativePath[];
  /**
   * "One case set per in-scope type" (P2-16), one status per case-bearing type — `undefined` on a
   * project with no `config.yaml` yet, since there is no testing scope to check completeness
   * against. A type recorded `not-applicable` here is reported, not silently absent: it is not
   * `in-scope`, so it needs no case set at all, distinct from `missing` (`in-scope` with none).
   */
  readonly caseSetStatusByType: Readonly<Record<string, CaseSetTypeStatus>> | undefined;
}

/**
 * `qa validate` / MCP `qa_validate` (P2-01, P2-05, ADR-003; P2-03 traceability): recomputes every
 * gate's status from the approval ledger and each approved artifact's current content, persists
 * the refreshed `state.json`, and separately re-checks every registered test case's requirement
 * links against the current scope artifact — `qa cases add` (P2-03) checks this once at
 * registration time, this catches a link broken later by editing `scope.json`. Callers treat a
 * reopened gate or any unlinked case as failure, never a phase simply not yet approved.
 */
export async function runValidate(context: EngineContext): Promise<ValidateReport> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const ledger = new ApprovalLedgerStore({ store, manifest });
  const gates = new GateStateMachine({
    store,
    stateStore: new PipelineStateStore({ store }),
    ledger,
    manifest,
    clock: context.clock,
  });

  const state = await gates.validate();
  const reopened: PhaseName[] = [];
  for (const phase of PHASES) {
    if (state.gates[phase].status !== 'open') {
      continue;
    }
    const approval = await ledger.latestForGate(phase);
    if (approval !== undefined) {
      reopened.push(phase);
    }
  }

  const { unlinkedCases, unresolvedTestData, cases } = await findCaseLinkIssues(context, store);
  const tamperedArtifacts = await findTamperedArtifacts(context, store, manifest);
  const caseSetStatusByType = await computeCaseSetStatusByType(store, cases);

  return { state, reopened, unlinkedCases, unresolvedTestData, tamperedArtifacts, caseSetStatusByType };
}

/**
 * Verifies every path the manifest has ever registered against the file on disk today, so
 * tampering outside `scope`/`cases add`/`approve` — artifacts nothing has re-read since — is
 * still caught the next time `qa validate` runs. Also flags the approval ledger specifically
 * (#304) when it exists on disk but was never registered at all: `findTamperedArtifacts` only
 * walks manifest entries, so a ledger `append()` has never touched would otherwise never appear
 * here even though `ApprovalLedgerStore.load()` already refuses to trust its content.
 */
async function findTamperedArtifacts(
  context: EngineContext,
  store: QaStore,
  manifestStore: ManifestStore,
): Promise<readonly RelativePath[]> {
  const manifest = await manifestStore.load();
  const tampered: RelativePath[] = [];
  for (const relativePath of Object.keys(manifest.artifacts).sort()) {
    const exists = await context.fs.pathExists(store.resolve(relativePath));
    if (!exists) {
      tampered.push(relativePath);
      continue;
    }
    const rawBytes = await store.readBytes(relativePath);
    const matches = await manifestStore.verifyContent(relativePath, rawBytes);
    if (!matches) {
      tampered.push(relativePath);
    }
  }

  if (manifest.artifacts[APPROVAL_LEDGER_PATH] === undefined) {
    const ledgerExists = await context.fs.pathExists(store.resolve(APPROVAL_LEDGER_PATH));
    if (ledgerExists) {
      tampered.push(APPROVAL_LEDGER_PATH);
    }
  }

  return tampered.sort();
}

interface CaseLinkIssues {
  readonly unlinkedCases: readonly UnlinkedCase[];
  readonly unresolvedTestData: readonly UnresolvedTestDataCase[];
  readonly cases: readonly TestCase[];
}

async function findCaseLinkIssues(context: EngineContext, store: QaStore): Promise<CaseLinkIssues> {
  const casesDirAbsolute = store.resolve(CASES_DIR);
  const caseFiles = await context.fs.listFiles(casesDirAbsolute);
  if (caseFiles.length === 0) {
    return { unlinkedCases: [], unresolvedTestData: [], cases: [] };
  }

  const scope = await loadScope(store);
  const knownTestDataIds = await loadKnownTestDataIds(context, store);
  const unlinkedCases: UnlinkedCase[] = [];
  const unresolvedTestData: UnresolvedTestDataCase[] = [];
  const cases: TestCase[] = [];
  for (const absolutePath of [...caseFiles].sort()) {
    const relativePath = store.toRelativePath(absolutePath);
    const testCase = await store.readJson(relativePath, TestCaseSchema);
    cases.push(testCase);
    const unlinkedRequirementIds = findUnlinkedRequirementIds(testCase.requirementIds, scope);
    if (unlinkedRequirementIds.length > 0) {
      unlinkedCases.push({ casePath: relativePath, id: testCase.id, unlinkedRequirementIds });
    }
    const unresolvedTestDataRefs = findUnresolvedTestDataRefs(testCase.testDataRefs, knownTestDataIds);
    if (unresolvedTestDataRefs.length > 0) {
      unresolvedTestData.push({ casePath: relativePath, id: testCase.id, unresolvedTestDataRefs });
    }
  }
  return { unlinkedCases, unresolvedTestData, cases };
}

/**
 * `undefined` on a project with no `config.yaml` yet — nothing to check "one case set per
 * in-scope type" (P2-16) against, distinct from a project that has decided every type.
 */
async function computeCaseSetStatusByType(
  store: QaStore,
  cases: readonly TestCase[],
): Promise<Readonly<Record<string, CaseSetTypeStatus>> | undefined> {
  const configExists = await store.pathExists('config.yaml');
  if (!configExists) {
    return undefined;
  }
  const config = await loadConfig(store);
  return checkCaseSetCompleteness(config.testing, cases).statusByType;
}

async function loadScope(store: QaStore): Promise<Scope> {
  const exists = await store.pathExists(SCOPE_PATH);
  if (!exists) {
    return { schemaVersion: SCHEMA_VERSION, generatedAt: new Date(0).toISOString(), requirements: [] };
  }
  return store.readJson(SCOPE_PATH, ScopeSchema);
}

async function loadKnownTestDataIds(
  context: EngineContext,
  store: QaStore,
): Promise<ReadonlySet<Identifier>> {
  const testDataDirAbsolute = store.resolve(TEST_DATA_DIR);
  const testDataFiles = await context.fs.listFiles(testDataDirAbsolute);
  const ids = new Set<Identifier>();
  for (const absolutePath of testDataFiles) {
    const relativePath = store.toRelativePath(absolutePath);
    const testData = await store.readJson(relativePath, TestDataSchema);
    ids.add(testData.id);
  }
  return ids;
}
