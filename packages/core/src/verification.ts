// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { basename, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Config,
  GeneratedTestSpec,
  RelativePath,
  RunResult,
  SpokeValidationIssue,
} from '@qa-ai-stlc/schemas';
import { loadConfig } from './config-loader.js';
import type { EngineContext } from './engine-context.js';
import { QaError } from './errors.js';
import { ManifestStore } from './manifest-store.js';
import { resolveBrowserEnvironment } from './operations/browser-open.js';
import { resolveRelativePath } from './paths.js';
import { randomIdGenerator, type IdGenerator } from './ports/id-generator.js';
import { QaStore } from './qa-store.js';
import type { Runner } from './runner.js';

// `typescript` ships this CLI entry with no shebang-only wrapper needed; resolved through Node's
// module graph, the same way `runner-playwright` resolves `@playwright/test/cli` (AGENTS.md 5.6),
// so it works whether `@qa-ai-stlc/core` is installed inside the monorepo or, once published,
// inside an operator's project.
const tscPath = fileURLToPath(import.meta.resolve('typescript/bin/tsc'));

// A generated spec is typechecked against a fixed, modern baseline rather than the operator's own
// tsconfig.json: `tsc` does not auto-discover a tsconfig when given explicit file arguments, and
// reading an arbitrary project's config would need to reconcile its `include`/`references`/path
// mapping with checking exactly one file in isolation. This is a deliberate scope limit, not an
// oversight — it still catches a real type error in the generated spec itself.
const TSC_ARGS = [
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
  /** The `Runner` implementation for the spec's test type (e.g. `playwrightRunner` for `e2e`). */
  readonly runner: Runner;
  readonly environment?: string;
  readonly idGenerator?: IdGenerator;
}

export type VerificationOutcome =
  | { readonly status: 'typecheck_failed'; readonly issues: readonly SpokeValidationIssue[] }
  | {
      readonly status: 'execution_failed';
      readonly issues: readonly SpokeValidationIssue[];
      readonly result: RunResult;
    }
  | { readonly status: 'verified'; readonly result: RunResult };

/**
 * The verification loop (P3-06, development plan section 5.2): a generated spec is never
 * registered on trust. Its content is typechecked and, only if that passes, executed once through
 * the injected `Runner`, against a scratch copy that never touches `spec.filePath` until
 * `registerVerifiedGeneratedTestSpec` is called with the resulting `'verified'` outcome. Either
 * failure mode returns `SpokeValidationIssue[]` in the same shape `SpokeErrorSchema.issues` already
 * uses, so the hub can re-dispatch the generating spoke with exactly what to fix.
 */
export async function verifyGeneratedTestSpec(
  context: EngineContext,
  options: VerifyGeneratedTestSpecOptions,
): Promise<VerificationOutcome> {
  const idGenerator = options.idGenerator ?? randomIdGenerator;
  const targetAbsolutePath = resolveRelativePath(context.projectRoot, options.spec.filePath);
  const scratchAbsolutePath = scratchSpecPath(targetAbsolutePath, idGenerator);

  await context.fs.mkdir(dirname(targetAbsolutePath));
  await context.fs.writeFile(scratchAbsolutePath, options.spec.content);

  try {
    const typecheckIssues = await runTypecheck(context, {
      absoluteFilePath: scratchAbsolutePath,
      displayPath: options.spec.filePath,
    });
    if (typecheckIssues.length > 0) {
      return { status: 'typecheck_failed', issues: typecheckIssues };
    }

    const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
    const config = await loadConfig(store);
    const environment = resolveBrowserEnvironment(config, options.environment);
    const runId = `verify-${idGenerator.next()}`;

    const outcomes = await options.runner.run(context, {
      runId,
      baseUrl: environment.config.baseUrl,
      specFiles: [scratchAbsolutePath],
      idGenerator,
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
    if (issues.length > 0) {
      return { status: 'execution_failed', issues, result: outcome.result };
    }
    return { status: 'verified', result: outcome.result };
  } finally {
    await context.fs.deleteFile(scratchAbsolutePath);
  }
}

/**
 * Writes a spec's content to its real `filePath` and registers it in the manifest (ADR-006 already
 * established this exact "write to the project tree, then `manifest.register`" pattern for the
 * generated locator module) — callable only with a `'verified'` `VerificationOutcome`, so a caller
 * cannot register a spec that has not actually gone through `verifyGeneratedTestSpec` successfully.
 */
export async function registerVerifiedGeneratedTestSpec(
  context: EngineContext,
  spec: GeneratedTestSpec,
  verification: Extract<VerificationOutcome, { status: 'verified' }>,
): Promise<void> {
  if (verification.result.testCaseId !== spec.testCaseId) {
    throw new QaError(
      'core.verification.spec_mismatch',
      `The verified result is for test case "${verification.result.testCaseId}", not "${spec.testCaseId}".`,
      {
        remediation:
          'Pass the VerificationOutcome that verifyGeneratedTestSpec returned for this exact spec.',
      },
    );
  }

  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
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
