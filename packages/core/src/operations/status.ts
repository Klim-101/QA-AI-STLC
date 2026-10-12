// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  RunResultSchema,
  TestCaseSchema,
  type PhaseName,
  type PipelineState,
  type RelativePath,
  type TestCase,
} from '@qa-ai-stlc/schemas';
import { ApprovalLedgerStore } from '../approval-ledger-store.js';
import type { EngineContext } from '../engine-context.js';
import { GateStateMachine } from '../gate.js';
import { ManifestStore } from '../manifest-store.js';
import { resolveRelativePath } from '../paths.js';
import { PHASES } from '../phases.js';
import { QaStore } from '../qa-store.js';
import { listRunResultPaths } from '../run-results.js';
import { extractSpecTestCaseIds } from '../spec-case-ids.js';
import { PipelineStateStore } from '../state-store.js';

const CASES_DIR: RelativePath = 'artifacts/cases';
const REGISTRY_PATH: RelativePath = 'selectors/registry.json';
const SPEC_SUFFIX = '.spec.ts';
// A list of case ids in one action stays readable; the count says how many there are in total.
const MAX_CASE_IDS_PER_ACTION = 10;

export type NextActionKind = 'phase' | 'explore' | 'execute' | 'generate';

/** One thing the operator can do next, derived from `.qa/` and never invented (AGENTS.md 12.1). */
export interface NextAction {
  readonly kind: NextActionKind;
  readonly title: string;
  readonly detail: string;
  /** The agent skill that does this work. */
  readonly skill: string;
  /** The engine tool the skill starts with. */
  readonly tool: string;
  /** The cases this action concerns: the first ten ids, and how many there are in all. */
  readonly cases?: { readonly ids: readonly string[]; readonly total: number };
}

export interface StatusReport {
  readonly state: PipelineState;
  /** Deterministic and ordered: the first entry is the one to do now. Empty when nothing is left. */
  readonly nextActions: readonly NextAction[];
}

// Typed over `PhaseName`, so adding a pipeline phase fails to compile until it names its skill.
const PHASE_SKILLS: Readonly<Record<PhaseName, { readonly skill: string; readonly tool: string }>> = {
  scope: { skill: 'qa-start', tool: 'qa.scope' },
  cases: { skill: 'qa-design-cases', tool: 'qa.cases_add' },
};

// The test types `qa-generate-tests` turns into specs.
const GENERATED_TEST_TYPES: ReadonlySet<TestCase['testType']> = new Set(['e2e', 'api']);

/**
 * `qa status` / MCP `qa_status` (#634): the pipeline's gates plus what to do next. The pipeline
 * state machine ends at `cases`, but exploration, execution and generation happen after it, outside
 * any gate; without this the operator is told only that nothing comes next. Every action is read
 * from what `.qa/` holds: an unfinished phase, a missing registry, a case with no passing result, a
 * passed case with no generated spec. Reads and refreshes `state.json` like `qa validate`, and
 * writes nothing else.
 */
export async function runStatus(context: EngineContext): Promise<StatusReport> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const gates = new GateStateMachine({
    store,
    stateStore: new PipelineStateStore({ store }),
    ledger: new ApprovalLedgerStore({ store, manifest }),
    manifest,
    configSource: context,
    clock: context.clock,
  });
  const state = await gates.validate();

  const unfinishedPhase = PHASES.find((phase) => state.gates[phase].status !== 'satisfied');
  if (unfinishedPhase !== undefined) {
    const { skill, tool } = PHASE_SKILLS[unfinishedPhase];
    return {
      state,
      nextActions: [
        {
          kind: 'phase',
          title: `Finish the "${unfinishedPhase}" phase`,
          detail: `The "${unfinishedPhase}" gate is ${state.gates[unfinishedPhase].status}; approve it before moving on.`,
          skill,
          tool,
        },
      ],
    };
  }
  return { state, nextActions: await findWorkAfterThePipeline(context, store, manifest) };
}

async function findWorkAfterThePipeline(
  context: EngineContext,
  store: QaStore,
  manifest: ManifestStore,
): Promise<readonly NextAction[]> {
  const cases = await loadCases(store);
  const passedCaseIds = await loadPassedCaseIds(store);
  const coveredCaseIds = await loadCaseIdsWithGeneratedSpec(context, manifest);
  const actions: NextAction[] = [];

  const hasWebCase = cases.some((testCase) => testCase.testType === 'e2e');
  if (hasWebCase && !(await store.pathExists(REGISTRY_PATH))) {
    actions.push({
      kind: 'explore',
      title: 'Explore the application',
      detail: 'No selector registry exists yet; the approved web cases need the pages it records.',
      skill: 'qa-explore',
      tool: 'qa.explore',
    });
  }

  const unexecuted = cases.filter((testCase) => !passedCaseIds.has(testCase.id));
  if (unexecuted.length > 0) {
    actions.push({
      kind: 'execute',
      title: 'Execute the approved cases',
      detail: `${String(unexecuted.length)} case(s) have no passing result yet; run each live to prove it works.`,
      skill: 'qa-execute',
      tool: 'qa.browser_open',
      ...listCases(unexecuted),
    });
  }

  const ungenerated = cases.filter(
    (testCase) =>
      passedCaseIds.has(testCase.id) &&
      GENERATED_TEST_TYPES.has(testCase.testType) &&
      !coveredCaseIds.has(testCase.id),
  );
  if (ungenerated.length > 0) {
    actions.push({
      kind: 'generate',
      title: 'Generate deterministic tests',
      detail: `${String(ungenerated.length)} passing case(s) have no generated spec yet.`,
      skill: 'qa-generate-tests',
      tool: 'qa.generation_proven_session',
      ...listCases(ungenerated),
    });
  }
  return actions;
}

function listCases(cases: readonly TestCase[]): { cases: { ids: string[]; total: number } } {
  return {
    cases: {
      ids: cases.map((testCase) => testCase.id).slice(0, MAX_CASE_IDS_PER_ACTION),
      total: cases.length,
    },
  };
}

async function loadCases(store: QaStore): Promise<readonly TestCase[]> {
  const paths = await store.listFiles(CASES_DIR);
  const cases = await Promise.all([...paths].sort().map((path) => store.readJson(path, TestCaseSchema)));
  return cases;
}

async function loadPassedCaseIds(store: QaStore): Promise<ReadonlySet<string>> {
  const ids = new Set<string>();
  for (const path of await listRunResultPaths(store)) {
    const result = await store.readJson(path, RunResultSchema);
    if (result.status === 'passed') {
      ids.add(result.testCaseId);
    }
  }
  return ids;
}

/** The case ids named by `testCaseId` annotations in every spec the manifest registered. */
async function loadCaseIdsWithGeneratedSpec(
  context: EngineContext,
  manifest: ManifestStore,
): Promise<ReadonlySet<string>> {
  const ids = new Set<string>();
  const specPaths = Object.keys((await manifest.load()).artifacts).filter((path) =>
    path.endsWith(SPEC_SUFFIX),
  );
  for (const path of specPaths) {
    const absolutePath = resolveRelativePath(context.projectRoot, path);
    if (!(await context.fs.pathExists(absolutePath))) {
      continue;
    }
    for (const id of extractSpecTestCaseIds(await context.fs.readFile(absolutePath))) {
      ids.add(id);
    }
  }
  return ids;
}
