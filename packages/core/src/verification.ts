// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { basename, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TestCaseSchema,
  VerificationIdSchema,
  VerificationRecordSchema,
  type Config,
  type GeneratedTestSpec,
  type RelativePath,
  type RunResult,
  type SpokeValidationIssue,
  type TestCase,
  type VerificationId,
  type VerificationRecord,
} from '@qa-ai-stlc/schemas';
import { ensureApiAuthModule } from './api-auth-module.js';
import { extractContractSha256 } from './api-contract.js';
import { loadConfig } from './config-loader.js';
import type { EngineContext } from './engine-context.js';
import { QaError } from './errors.js';
import { hashText } from './hash.js';
import { toCanonicalJson } from './json-file.js';
import { ManifestStore } from './manifest-store.js';
import { resolveBrowserEnvironment } from './operations/browser-open.js';
import { findCasePath } from './operations/cases-render.js';
import { resolveRelativePath } from './paths.js';
import { randomIdGenerator, type IdGenerator } from './ports/id-generator.js';
import { QaStore } from './qa-store.js';
import type { Runner } from './runner.js';
import { canonicalStepIds } from './step-ids.js';

// `typescript` ships this CLI entry with no shebang-only wrapper needed; resolved through Node's
// module graph, the same way `runner-playwright` resolves `@playwright/test/cli` (AGENTS.md 5.6),
// so it works whether `@qa-ai-stlc/core` is installed inside the monorepo or, once published,
// inside an operator's project.
const tscPath = fileURLToPath(import.meta.resolve('typescript/bin/tsc'));

// A generated spec is typechecked against a fixed, modern baseline rather than the operator's own
// tsconfig.json: reading an arbitrary project's config would need to reconcile its
// `include`/`references`/path mapping with checking exactly one file in isolation. This is a
// deliberate scope limit, not an oversight — it still catches a real type error in the generated
// spec itself. `--ignoreConfig` is required, not cosmetic: since TypeScript 6, `tsc <files>` exits
// with TS5112 when a tsconfig.json sits in the working directory, which for the MCP server is the
// project root of nearly every TypeScript project, so every spec would fail verification.
const TSC_ARGS = [
  '--ignoreConfig',
  '--noEmit',
  '--skipLibCheck',
  '--strict',
  '--target',
  'es2022',
  '--module',
  'nodenext',
  '--moduleResolution',
  'nodenext',
];

// `tsc`'s own diagnostic line format with no `--pretty`: `<file>(<line>,<col>): error <code>: <message>`.
// Parsed with plain string operations, not a capturing regex, since `noUncheckedIndexedAccess`
// makes every regex capture group `string | undefined` regardless of how the pattern is written —
// the checks below are real (a malformed or continuation line has no such position), not padding
// around a capture group TypeScript cannot prove is present.
function parseTypecheckDiagnostic(line: string, displayPath: RelativePath): SpokeValidationIssue | undefined {
  const openParenIndex = line.indexOf('(');
  const closeParenIndex = line.indexOf(')', openParenIndex + 1);
  const errorMarker = '): error ';
  if (openParenIndex === -1 || closeParenIndex === -1 || !line.startsWith(errorMarker, closeParenIndex)) {
    return undefined;
  }

  const [lineText, columnText] = line.slice(openParenIndex + 1, closeParenIndex).split(',');
  const lineNumber = Number(lineText);
  const column = Number(columnText);
  if (Number.isNaN(lineNumber) || Number.isNaN(column)) {
    return undefined;
  }

  return {
    path: [displayPath, lineNumber, column],
    message: line.slice(closeParenIndex + errorMarker.length),
  };
}

async function runTypecheck(
  context: EngineContext,
  options: { readonly absoluteFilePath: string; readonly displayPath: RelativePath },
): Promise<readonly SpokeValidationIssue[]> {
  const result = await context.processRunner.run(process.execPath, [
    tscPath,
    ...TSC_ARGS,
    options.absoluteFilePath,
  ]);
  if (result.exitCode === 0) {
    return [];
  }

  const issues = result.stdout
    .split('\n')
    .map((line) => parseTypecheckDiagnostic(line.trim(), options.displayPath))
    .filter((issue): issue is SpokeValidationIssue => issue !== undefined);
  if (issues.length > 0) {
    return issues;
  }

  // A non-zero exit with no line this parser recognized is `tsc` itself failing (a crash, an
  // unresolvable module) rather than an ordinary type error — surface the raw output instead of
  // silently reporting "no issues" for a real failure.
  const rawOutput = result.stderr.trim().length > 0 ? result.stderr.trim() : result.stdout.trim();
  return [
    {
      path: [options.displayPath],
      message: rawOutput.length > 0 ? rawOutput : 'tsc exited with a failure and produced no output.',
    },
  ];
}

function assertNever(value: never): never {
  throw new Error(`Unhandled RunResult status: ${String(value)}`);
}

// The exact same fields `RunResultSchema` already carries for this purpose (P3-02's `missingStepIds`,
// P3-03's `failure`) — reused here, not reinvented, so "feedback names the failing step" is the
// same identity a rendered report or `qa validate --run` already uses for the same result.
function executionIssues(result: RunResult): readonly SpokeValidationIssue[] {
  switch (result.status) {
    case 'passed':
      return [];
    case 'failed':
      return [
        {
          path: [],
          message: result.failure?.message ?? 'The generated spec failed with no recorded failure detail.',
        },
      ];
    case 'partial':
      return (result.missingStepIds ?? []).map((stepId) => ({
        path: [stepId],
        message: `Step "${stepId}" did not run or did not complete.`,
      }));
    case 'blocked':
    case 'skipped':
    case 'uncertain':
      return [{ path: [], message: `Execution reported status "${result.status}", not "passed".` }];
    default:
      return assertNever(result.status);
  }
}

// A sibling of the real target, in the same directory, so the generated spec's own relative
// imports (the locator module, any relative helper) resolve exactly as they would after
// registration — the same precondition `runner-playwright` documented for a hand-written spec
// placed outside a project's tree entirely (P3-01): resolution needs the real directory, not an
// arbitrary scratch location.
function scratchSpecPath(targetAbsolutePath: string, idGenerator: IdGenerator): string {
  const directory = dirname(targetAbsolutePath);
  const extension = extname(targetAbsolutePath);
  const stem = basename(targetAbsolutePath, extension);
  return `${directory}/.qa-verify-${stem}-${idGenerator.next()}${extension}`;
}

export interface VerifyGeneratedTestSpecOptions {
  readonly spec: GeneratedTestSpec;
  /**
   * The registered case `spec` claims to codify (P3-20): its `steps` are the canonical authority
   * coverage is checked against (`canonicalStepIds`), never the spec's own self-declared `stepIds`
   * annotation — a spec that declares fewer steps than the case actually has, or none at all, is
   * rejected instead of silently passing as covering zero required steps.
   */
  readonly testCase: TestCase;
  /** The `Runner` implementation for the spec's test type (e.g. `playwrightRunner` for `e2e`). */
  readonly runner: Runner;
  readonly environment?: string;
  readonly idGenerator?: IdGenerator;
  /**
   * The contract hash an `api` spec was generated against (`GenerationSpokeInput.apiContract`).
   * When given, the spec must declare the same value as `CONTRACT_SHA256`, so a spec that was not
   * written against this contract cannot be verified, let alone registered (P6-13).
   */
  readonly contractSha256?: string;
}

export type VerificationOutcome =
  | {
      readonly status: 'typecheck_failed';
      readonly verificationId: VerificationId;
      readonly issues: readonly SpokeValidationIssue[];
    }
  | {
      readonly status: 'execution_failed';
      readonly verificationId: VerificationId;
      readonly issues: readonly SpokeValidationIssue[];
      readonly result: RunResult;
    }
  | { readonly status: 'verified'; readonly verificationId: VerificationId; readonly result: RunResult };

function verificationRecordPath(verificationId: VerificationId): RelativePath {
  return `verifications/${verificationId}.json`;
}

async function writeVerificationRecord(
  store: QaStore,
  manifest: ManifestStore,
  record: Omit<VerificationRecord, 'schemaVersion'>,
): Promise<void> {
  const recordPath = verificationRecordPath(record.id);
  const parsed = VerificationRecordSchema.parse(record);
  await store.writeJson(recordPath, parsed);
  await manifest.register(recordPath, toCanonicalJson(parsed));
}

/**
 * Resolves `testCaseId` to the case the engine registered, rejecting a tampered case file. Both
 * verification and registration go through this, so neither accepts a spec for a case that does
 * not exist, the same rule `runRegisterCaseResult` (P3-17) applies to a case result.
 */
async function readRegisteredTestCase(
  store: QaStore,
  manifest: ManifestStore,
  testCaseId: string,
): Promise<TestCase> {
  const casePath = await findCasePath(store, testCaseId);
  await manifest.assertRegistered(casePath, await store.readText(casePath));
  return store.readJson(casePath, TestCaseSchema);
}

/**
 * The verification loop (P3-06, development plan section 5.2): a generated spec is never
 * registered on trust. Its content is typechecked and, only if that passes, executed once through
 * the injected `Runner`, against a scratch copy that never touches `spec.filePath`. Every outcome
 * is recorded by the engine as a manifest-registered `VerificationRecord` (P4-13), and only a
 * `'verified'` record's `verificationId` lets `registerVerifiedGeneratedTestSpec` write the spec.
 * Either failure mode returns `SpokeValidationIssue[]` in the same shape `SpokeErrorSchema.issues`
 * already uses, so the hub can re-dispatch the generating spoke with exactly what to fix.
 */
export async function verifyGeneratedTestSpec(
  context: EngineContext,
  options: VerifyGeneratedTestSpecOptions,
): Promise<VerificationOutcome> {
  if (options.testCase.id !== options.spec.testCaseId) {
    throw new QaError(
      'core.verification.test_case_mismatch',
      `"testCase" is "${options.testCase.id}", but the spec is for test case "${options.spec.testCaseId}".`,
      { remediation: 'Pass the exact TestCase the spec was generated from.' },
    );
  }

  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  // Coverage is checked against the case's steps (P3-20), so a caller-edited copy with fewer steps
  // than the registered case would otherwise verify a spec that skips the missing ones.
  const registeredTestCase = await readRegisteredTestCase(store, manifest, options.testCase.id);
  if (toCanonicalJson(TestCaseSchema.parse(options.testCase)) !== toCanonicalJson(registeredTestCase)) {
    throw new QaError(
      'core.verification.test_case_changed',
      `"testCase" differs from the registered test case "${options.testCase.id}".`,
      { remediation: 'Rebuild the spoke input with qa.generation_spoke_input and regenerate the spec.' },
    );
  }

  if (
    options.contractSha256 !== undefined &&
    extractContractSha256(options.spec.content) !== options.contractSha256
  ) {
    throw new QaError(
      'core.verification.contract_stamp_mismatch',
      `The spec for "${options.spec.testCaseId}" does not declare CONTRACT_SHA256 = "${options.contractSha256}".`,
      {
        remediation:
          'Add `export const CONTRACT_SHA256 = "<hash>";` with the apiContract.sha256 from qa.generation_spoke_input.',
      },
    );
  }

  const idGenerator = options.idGenerator ?? randomIdGenerator;
  const verificationId = VerificationIdSchema.parse(`verification-${idGenerator.next()}`);
  const recordBase = {
    id: verificationId,
    testCaseId: options.spec.testCaseId,
    filePath: options.spec.filePath,
    contentSha256: hashText(options.spec.content),
  };
  const targetAbsolutePath = resolveRelativePath(context.projectRoot, options.spec.filePath);
  const scratchAbsolutePath = scratchSpecPath(targetAbsolutePath, idGenerator);

  await context.fs.mkdir(dirname(targetAbsolutePath));
  await context.fs.writeFile(scratchAbsolutePath, options.spec.content);

  try {
    if (options.testCase.testType === 'api') {
      // The spec imports this helper, so typechecking needs it in place and current.
      await ensureApiAuthModule(context, (await loadConfig(context)).apiAuth);
    }
    const typecheckIssues = await runTypecheck(context, {
      absoluteFilePath: scratchAbsolutePath,
      displayPath: options.spec.filePath,
    });
    if (typecheckIssues.length > 0) {
      await writeVerificationRecord(store, manifest, {
        ...recordBase,
        status: 'typecheck_failed',
        verifiedAt: context.clock.now().toISOString(),
      });
      return { status: 'typecheck_failed', verificationId, issues: typecheckIssues };
    }

    const config = await loadConfig(context);
    const environment = resolveBrowserEnvironment(config, options.environment);
    const runId = `verify-${idGenerator.next()}`;

    const outcomes = await options.runner.run(context, {
      runId,
      baseUrl: environment.config.baseUrl,
      environment: environment.name,
      specFiles: [scratchAbsolutePath],
      idGenerator,
      requiredStepIds: canonicalStepIds(registeredTestCase),
      testIdAttribute: config.selectors.testIdAttribute,
    });
    const [outcome, ...extra] = outcomes;
    if (outcome === undefined || extra.length > 0) {
      throw new QaError(
        'core.verification.unexpected_outcome_count',
        `Verifying a generated spec must produce exactly one run result; got ${String(outcomes.length)}.`,
      );
    }
    if (outcome.result.testCaseId !== options.spec.testCaseId) {
      throw new QaError(
        'core.verification.test_case_id_mismatch',
        `The generated spec's execution reported test case "${outcome.result.testCaseId}", not "${options.spec.testCaseId}".`,
        { remediation: 'The generator must embed a matching testCaseId annotation in the spec it produces.' },
      );
    }

    const issues = executionIssues(outcome.result);
    const status = issues.length > 0 ? 'execution_failed' : 'verified';
    await writeVerificationRecord(store, manifest, {
      ...recordBase,
      status,
      result: outcome.result,
      verifiedAt: context.clock.now().toISOString(),
    });
    if (status === 'execution_failed') {
      return { status, verificationId, issues, result: outcome.result };
    }
    return { status, verificationId, result: outcome.result };
  } finally {
    await context.fs.deleteFile(scratchAbsolutePath);
  }
}

function assertRecordAuthorizes(record: VerificationRecord, spec: GeneratedTestSpec): void {
  if (record.status !== 'verified') {
    throw new QaError(
      'core.verification.not_verified',
      `Verification "${record.id}" ended with status "${record.status}", not "verified".`,
      {
        remediation:
          'Fix the reported issues, verify the spec again and register it with the new verificationId.',
      },
    );
  }
  if (record.consumedAt !== undefined) {
    throw new QaError(
      'core.verification.already_consumed',
      `Verification "${record.id}" already authorized a registration at ${record.consumedAt}.`,
      { remediation: 'Verify the spec again to register it a second time.' },
    );
  }
  if (record.testCaseId !== spec.testCaseId || record.filePath !== spec.filePath) {
    throw new QaError(
      'core.verification.spec_mismatch',
      `Verification "${record.id}" is for "${record.filePath}" (test case "${record.testCaseId}"), ` +
        `not "${spec.filePath}" (test case "${spec.testCaseId}").`,
      { remediation: 'Pass the verificationId qa.generation_verify returned for this exact spec.' },
    );
  }
  if (record.contentSha256 !== hashText(spec.content)) {
    throw new QaError(
      'core.verification.content_mismatch',
      `"${spec.filePath}"'s content does not match what was actually verified for test case "${spec.testCaseId}".`,
      {
        remediation:
          'Pass the exact spec qa.generation_verify verified, unmodified, with its verificationId.',
      },
    );
  }
}

/**
 * Writes a spec's content to its real `filePath` and registers it in the manifest (ADR-006's
 * "write to the project tree, then `manifest.register`" pattern). Authorized only by
 * `verificationId`, the engine's own record of a `'verified'` run of this exact spec (P4-13): the
 * record must be registered and untampered, match the spec's test case, file path and content
 * hash, and not have authorized a registration before. The record is marked consumed before the
 * spec is written, so a failed write burns the verification instead of leaving it reusable.
 */
export async function registerVerifiedGeneratedTestSpec(
  context: EngineContext,
  spec: GeneratedTestSpec,
  verificationId: string,
): Promise<void> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });

  const parsedId = VerificationIdSchema.safeParse(verificationId);
  const record = parsedId.success
    ? await manifest.readVerified(verificationRecordPath(parsedId.data), VerificationRecordSchema)
    : undefined;
  if (record === undefined) {
    throw new QaError('core.verification.record_not_found', `No verification record "${verificationId}".`, {
      remediation: 'Run qa.generation_verify on the spec and pass the verificationId it returns.',
    });
  }
  assertRecordAuthorizes(record, spec);
  await readRegisteredTestCase(store, manifest, spec.testCaseId);

  await writeVerificationRecord(store, manifest, {
    ...record,
    consumedAt: context.clock.now().toISOString(),
  });

  const absolutePath = resolveRelativePath(context.projectRoot, spec.filePath);
  await context.fs.mkdir(dirname(absolutePath));
  await context.fs.writeFile(absolutePath, spec.content);
  await manifest.register(spec.filePath, spec.content);
}

/**
 * True when the hub's spoke-retry budget (`config.agents.retries`, already established for the
 * agent layer generally) still allows another regeneration attempt after `attemptsSoFar` failed
 * verifications. The retry loop itself — re-dispatching the generating spoke with a failed
 * outcome's `issues` — is a hub responsibility, not this engine's: regenerating the spec is a
 * model call, which the engine never makes (AGENTS.md non-negotiable boundary 1).
 */
export function hasVerificationRetryBudget(config: Config, attemptsSoFar: number): boolean {
  return attemptsSoFar <= config.agents.retries;
}
