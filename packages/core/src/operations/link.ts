// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  SCHEMA_VERSION,
  ScopeSchema,
  TestCaseSchema,
  type Identifier,
  type RelativePath,
  type Scope,
  type TestType,
} from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { loadConfig } from '../config-loader.js';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { toCanonicalJson } from '../json-file.js';
import { ManifestStore } from '../manifest-store.js';
import { assertRelativePath, resolveRelativePath } from '../paths.js';
import { randomIdGenerator, type IdGenerator } from '../ports/id-generator.js';
import { QaStore } from '../qa-store.js';
import { findUnlinkedRequirementIds } from '../requirement-linking.js';
import { findUndecidedTestingTypes } from '../testing-scope.js';
import { regenerateCaseIndexes } from './cases-index.js';

const SCOPE_PATH: RelativePath = 'artifacts/scope.json';
const DEFAULT_SCOPE_GENERATED_AT = new Date(0).toISOString();

// Matches Playwright's `test(title, { annotation: { type: 'testCaseId', description: '<id>' } },
// ...)` convention (runner-playwright's map-result.ts, the only place a run result's testCaseId is
// ever read from) so a hand-written spec that already declares its own case id is linked under
// that same id, instead of a fresh one disconnected from what a later `qa run` will report.
const TEST_CASE_ID_ANNOTATION = /type:\s*(['"])testCaseId\1\s*,\s*description:\s*(['"])([^'"]+)\2/;

export interface LinkOptions {
  readonly specFile?: string;
  readonly requirementId?: string;
  readonly feature?: string;
  readonly testType?: TestType;
  readonly idGenerator?: IdGenerator;
}

export interface LinkResult {
  readonly testCaseId: Identifier;
  readonly casePath: RelativePath;
  readonly requirementId: Identifier;
  /** `false` when the spec had no `testCaseId` annotation, so one was minted here and the spec
   * still needs it added before a `qa run` on it can attribute a result to this case. */
  readonly annotationFound: boolean;
}

/**
 * `qa link <spec> <requirement-id> --feature <name>` / MCP `qa.link` (development plan section 9,
 * "Existing tests"): folds an already-existing, hand-written Playwright spec into the requirement
 * → case → result → evidence traceability matrix without running it through generation. Writes a
 * minimal `TestCase` artifact under `artifacts/cases/<feature>/<id>.json` (P2-20) that points back
 * at the spec for its real steps and expected result, rather than fabricating case content the
 * engine never authored (ADR-001).
 */
export async function runLink(context: EngineContext, options: LinkOptions): Promise<LinkResult> {
  if (
    options.specFile === undefined ||
    options.requirementId === undefined ||
    options.feature === undefined
  ) {
    throw new QaError('LINK_USAGE', 'Usage: qa link <spec> <requirement-id> --feature <name>', {
      remediation: 'Example: qa link tests/foo.spec.ts req-12 --feature checkout',
    });
  }

  const specPath = assertRelativePath(options.specFile);
  const absoluteSpecPath = resolveRelativePath(context.projectRoot, specPath);
  const exists = await context.fs.pathExists(absoluteSpecPath);
  if (!exists) {
    throw new QaError('LINK_SPEC_NOT_FOUND', `"${specPath}" does not exist`, {
      remediation: 'Check <spec> points at a real, readable file relative to the project root.',
    });
  }

  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const config = await loadConfig(store);
  const testType = options.testType ?? 'e2e';
  const undecided = findUndecidedTestingTypes(config.testing);
  if (undecided.length > 0) {
    throw new QaError(
      'LINK_TESTING_UNDECIDED',
      `Testing scope is still undecided for: ${undecided.join(', ')}`,
      {
        remediation:
          'Run "qa config set testing.<type> <in-scope|out-of-scope>" for each type listed, then re-run "qa link".',
      },
    );
  }
  if (config.testing[testType] !== 'in-scope') {
    throw new QaError(
      'LINK_TYPE_OUT_OF_SCOPE',
      `testType "${testType}" is out of scope (testing.${testType} is "${config.testing[testType]}")`,
      {
        remediation: `Set "testing.${testType}" to "in-scope" first, or pass --test-type for an in-scope type.`,
      },
    );
  }

  const manifestStore = new ManifestStore({ store, clock: context.clock });
  const scope = await loadScope(manifestStore);
  const unlinked = findUnlinkedRequirementIds([options.requirementId], scope);
  if (unlinked.length > 0) {
    throw new QaError(
      'LINK_UNLINKED_REQUIREMENT',
      `Requirement "${options.requirementId}" is not in artifacts/scope.json`,
      { remediation: 'Run "qa scope" to register the requirement first, or fix the requirement id.' },
    );
  }

  const specContent = await context.fs.readFile(absoluteSpecPath);
  const annotation = TEST_CASE_ID_ANNOTATION.exec(specContent);
  const idGenerator = options.idGenerator ?? randomIdGenerator;
  const annotationFound = annotation !== null;
  const testCaseId = annotation?.[3] ?? `test-case-${idGenerator.next()}`;

  const parsed = TestCaseSchema.safeParse({
    id: testCaseId,
    feature: options.feature,
    requirementIds: [options.requirementId],
    testType,
    title: `Hand-written test: ${specPath}`,
    steps: [{ description: `See ${specPath} for the test steps.` }],
    expectedResult: `See ${specPath} for the expected result.`,
    status: 'approved',
    createdAt: context.clock.now().toISOString(),
  });
  if (!parsed.success) {
    throw new QaError(
      'LINK_INVALID_CASE',
      `Could not build a test case for "${specPath}":\n${z.prettifyError(parsed.error)}`,
      {
        remediation: 'Check --feature is kebab-case and the requirement id is not empty.',
        cause: parsed.error,
      },
    );
  }
  const testCase = parsed.data;

  const casePath: RelativePath = `artifacts/cases/${testCase.feature}/${testCase.id}.json`;
  const serialized = toCanonicalJson(testCase);
  await store.writeText(casePath, serialized);
  await manifestStore.register(casePath, serialized);
  // Keeps the `cases` gate's aggregate snapshot (#357) current, same as `qa cases add`.
  await regenerateCaseIndexes(store, manifestStore);

  return { testCaseId, casePath, requirementId: options.requirementId, annotationFound };
}

/**
 * Verifies `artifacts/scope.json` against the manifest before trusting it for requirement links,
 * so a case cannot be linked against a hand-edited scope (P2-07, `.qa/` integrity) — same check
 * `qa cases add` makes before registering a case.
 */
async function loadScope(manifestStore: ManifestStore): Promise<Scope> {
  const scope = await manifestStore.readVerified(SCOPE_PATH, ScopeSchema);
  if (scope !== undefined) {
    return scope;
  }
  return { schemaVersion: SCHEMA_VERSION, generatedAt: DEFAULT_SCOPE_GENERATED_AT, requirements: [] };
}
