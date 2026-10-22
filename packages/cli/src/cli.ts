// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { parseArgs, type ParseArgsConfig } from 'node:util';
import {
  PHASES,
  QaError,
  runAgentsGenerate,
  runApprove,
  runCasesAdd,
  runCasesRender,
  runConfigShow,
  runDefectAccept,
  runDefectAdd,
  runDoctor,
  runLink,
  runRcaAdd,
  runRcaApprove,
  runReport,
  runScope,
  runTestDataAdd,
  runRegressionPlan,
  runReviewAdd,
  renderRunMetricsMarkdown,
  runRunMetrics,
  runStatus,
  runTriageAdd,
  runValidate,
  type ApproveResult,
  type CasesAddResult,
  type CasesRenderResult,
  type ConfigShowResult,
  type ConfigShowValue,
  type ConfigValueLayer,
  type DefectAcceptResult,
  type DefectAddResult,
  type DoctorReport,
  type LinkResult,
  type AgentsGenerateResult,
  type RcaAddResult,
  type RcaApproveResult,
  type ReportFormat,
  type ReportResult,
  type RequestSummary,
  type ScopeResult,
  BLOCKED_REQUEST_REASONS,
  SAFE_HTTP_METHODS,
  type BlockedRequestReason,
  type TestDataAddResult,
  type StatusReport,
  type ValidateReport,
  type A11yTargetAnswers,
} from '@qa-ai-stlc/core';
import {
  A11yConformanceLevelSchema,
  A11yWcagVersionSchema,
  TestTypeSchema,
  UiComponentLibrarySchema,
  type RegressionPlan,
  type TestingScopeDecision,
  type TestType,
  type UiComponentLibrary,
} from '@qa-ai-stlc/schemas';
import { stringify as stringifyYaml } from 'yaml';
import type { CliIO } from './cli-io.js';
import { createCommandContext, type CreateCommandContextOptions } from './command-context.js';
import { formatConfigRelaxation, printConfigRelaxations } from './config-relaxations.js';
import {
  runConfigAddEnvironment,
  runConfigAddApiAuthProfile,
  runConfigAddIdentity,
  type ConfigAddEnvironmentResult,
  type ConfigAddApiAuthProfileResult,
  type ConfigAddIdentityResult,
} from './commands/config-add.js';
import { runConfigSet, type ConfigSetResult } from './commands/config-set.js';
import { runApiDiff, type ApiDiffSummary } from './commands/api-diff.js';
import { runExplore, type ExploreReport } from './commands/explore.js';
import { runInit, type InitResult, type TestingScopeAnswers } from './commands/init.js';
import { runRun, type RunSummary } from './commands/run.js';
import { runSpecCheckCommand } from './commands/spec-check.js';
import {
  runSecurityAuditCommand,
  runSecurityAuthorizationAdd,
  runSecurityAuthorizationApprove,
  type SecurityAuditSummary,
  type SecurityAuthorizationAddResult,
  type SecurityAuthorizationApproveResult,
} from './commands/security.js';
import { EXIT_FAILURE, EXIT_SUCCESS, EXIT_USAGE } from './exit-codes.js';
import { readPackageVersion } from './package-version.js';

export type RunCliDependencies = Omit<CreateCommandContextOptions, 'projectRoot' | 'json'> & {
  readonly io: CliIO;
  readonly projectRoot?: string;
};

const USAGE = `Usage: qa <command> [options]

Commands:
  init          Create the .qa/ store and run the testing scope survey
  doctor        Check Node, browsers, identities and environment reachability
  explore       Build the selector registry: crawl, static source analysis, pick mode, --verify
  api-diff      Compare the OpenAPI contract with the endpoints the last explore observed: "api-diff [--environment <name>]"
  agents generate Write one Claude Code subagent per spoke into .claude/agents with the model agents.models routes it to: "agents generate"
  config set    Change one setting after init: "config set testing.<type> <decision>" or "config set ui.componentLibrary <library>"
  config add    Add an environment, identity or API auth profile: "config add environment <name> ...", "config add identity <name> ..." or "config add api-auth <name> --profile <json>"
  config show   Print the effective configuration and its relaxations: "config show [--explain]" also names the source layer of every value
  scope         Extract requirements into the scope artifact: "scope --from file --path <path>" or "scope --from text --content <text> --label <label>"
  cases add     Validate and register a test case: "cases add --path <path>"
  cases render  Render a registered test case as Markdown: "cases render <id>"
  test-data add Validate and register a reusable test-data set: "test-data add --path <path>"
  run           Run a spec set through a runner and record the results: "run --spec <path> [--spec <path> ...] [--test-type e2e] [--environment <name>] [--identity <name>]"
  spec check    Run a spec set and say what each test did, recording nothing: "spec check --spec <path> [--spec <path> ...] [--test-type e2e] [--environment <name>] [--identity <name>]"
  link          Register a hand-written spec in traceability without regeneration: "link <spec> <requirement-id> --feature <name> [--test-type e2e]"
  report        Render a run summary and the traceability matrix: "report [--run <run-id>] [--format markdown|html] [--output [path]]"
  defect add    Validate and register a defect draft: "defect add --path <path>"
  defect accept Accept a registered defect draft: "defect accept <id> --approved-by <name> [--note <text>]"
  regression plan Select the regression pack for a tier: "regression plan --max-tier smoke|critical-path|regression|extended"
  metrics       Show how a run of the agent layer was carried out, from the spoke records and the agents budgets: "metrics [--run <run-id>]"
  review add    Validate and register the verdict on a generated spec: "review add --path <path>"
  triage add    Validate and register the classification of a run's failures: "triage add --path <path>"
  rca add       Validate and register a root cause analysis for an accepted defect: "rca add --path <path>"
  rca approve   Approve a registered RCA: "rca approve <defect-id> --approved-by <name> [--note <text>]"
  security      On demand, never part of the pipeline: "security authorize --path <path>", "security approve --approved-by <name>" and "security audit" (security testing must be in scope)
  approve       Approve a pipeline gate: "approve <gate> --artifact <path> --approved-by <name>"
  status        Show the pipeline gates and what to do next, including exploring, executing and generating after the last gate
  validate      Recompute every gate's status and every case's requirement links: "validate [--run]" also sweeps every run result for a fabricated evidence link or a failed result missing evidence; nonzero exit on any of these

Global options:
  --json         Print machine-readable JSON instead of human text
  -h, --help     Show this help
  --version      Show the CLI version`;

/**
 * Parses argv and dispatches to a command, returning the process exit code (AGENTS.md 5.4:
 * `process.exit` itself belongs only in the bin entry point). Never throws: an unexpected error
 * is reported on `stderr` and turned into `EXIT_FAILURE` instead of an uncaught stack trace.
 */
export async function runCli(argv: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const { io } = dependencies;
  const [command, ...rest] = argv;

  if (command === undefined || command === '--help' || command === '-h') {
    io.stdout(USAGE);
    return command === undefined ? EXIT_USAGE : EXIT_SUCCESS;
  }
  if (command === '--version') {
    io.stdout(readPackageVersion());
    return EXIT_SUCCESS;
  }

  try {
    // `init` writes the configuration rather than reading it, so it has nothing to report.
    if (command !== 'init') {
      await printConfigRelaxations(
        createCommandContext({ ...dependencies, projectRoot: dependencies.projectRoot ?? process.cwd() }),
        io,
      );
    }
    switch (command) {
      case 'init':
        return await dispatchInit(rest, dependencies);
      case 'doctor':
        return await dispatchDoctor(rest, dependencies);
      case 'explore':
        return await dispatchExplore(rest, dependencies);
      case 'api-diff':
        return await dispatchApiDiff(rest, dependencies);
      case 'agents':
        return await dispatchAgents(rest, dependencies);
      case 'config':
        return await dispatchConfig(rest, dependencies);
      case 'scope':
        return await dispatchScope(rest, dependencies);
      case 'cases':
        return await dispatchCases(rest, dependencies);
      case 'test-data':
        return await dispatchTestData(rest, dependencies);
      case 'run':
        return await dispatchRun(rest, dependencies);
      case 'spec':
        return await dispatchSpec(rest, dependencies);
      case 'link':
        return await dispatchLink(rest, dependencies);
      case 'report':
        return await dispatchReport(rest, dependencies);
      case 'defect':
        return await dispatchDefect(rest, dependencies);
      case 'regression':
        return await dispatchRegression(rest, dependencies);
      case 'metrics':
        return await dispatchMetrics(rest, dependencies);
      case 'review':
        return await dispatchReview(rest, dependencies);
      case 'triage':
        return await dispatchTriage(rest, dependencies);
      case 'rca':
        return await dispatchRca(rest, dependencies);
      case 'security':
        return await dispatchSecurity(rest, dependencies);
      case 'approve':
        return await dispatchApprove(rest, dependencies);
      case 'status':
        return await dispatchStatus(rest, dependencies);
      case 'validate':
        return await dispatchValidate(rest, dependencies);
      default:
        io.stderr(`Unknown command "${command}".\n\n${USAGE}`);
        return EXIT_USAGE;
    }
  } catch (error) {
    return reportError(io, error);
  }
}

function isParseArgsError(error: unknown): error is Error & { code: string } {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('ERR_PARSE_ARGS')
  );
}

function reportError(io: CliIO, error: unknown): number {
  if (isParseArgsError(error)) {
    io.stderr(`error: ${error.message}\n\n${USAGE}`);
    return EXIT_USAGE;
  }
  if (error instanceof QaError) {
    io.stderr(`error: ${error.message}`);
    if (error.remediation !== undefined) {
      io.stderr(error.remediation);
    }
    return EXIT_FAILURE;
  }
  io.stderr(`error: ${error instanceof Error ? error.message : String(error)}`);
  return EXIT_FAILURE;
}

function parseCommandArgs(
  rest: readonly string[],
  options: ParseArgsConfig['options'],
): Record<string, unknown> {
  const { values } = parseArgs({ args: [...rest], options, allowPositionals: false, strict: true });
  return values;
}

function parseTestingScopeFlag(value: string | undefined, flag: string): TestingScopeDecision | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value !== 'in-scope' && value !== 'out-of-scope' && value !== 'undecided') {
    throw new QaError('INIT_OPTION_INVALID', `"${value}" is not valid for ${flag}`, {
      remediation: 'Use one of: in-scope, out-of-scope, undecided.',
    });
  }
  return value;
}

function parseA11yTarget(values: Record<string, unknown>): Partial<A11yTargetAnswers> | undefined {
  const rawVersion = values['a11y-wcag-version'];
  const rawLevel = values['a11y-level'];
  const version = typeof rawVersion === 'string' ? A11yWcagVersionSchema.safeParse(rawVersion) : undefined;
  const level = typeof rawLevel === 'string' ? A11yConformanceLevelSchema.safeParse(rawLevel) : undefined;
  if (version?.success === false) {
    throw new QaError('INIT_OPTION_INVALID', `"${String(rawVersion)}" is not valid for --a11y-wcag-version`, {
      remediation: 'Use one of: 2.0, 2.1, 2.2.',
    });
  }
  if (level?.success === false) {
    throw new QaError('INIT_OPTION_INVALID', `"${String(rawLevel)}" is not valid for --a11y-level`, {
      remediation: 'Use one of: A, AA, AAA.',
    });
  }
  const target: Partial<A11yTargetAnswers> = {
    ...(version?.success === true ? { wcagVersion: version.data } : {}),
    ...(level?.success === true ? { level: level.data } : {}),
    ...(values['a11y-best-practices'] === true ? { bestPractices: true } : {}),
  };
  return Object.keys(target).length === 0 ? undefined : target;
}

function parseComponentLibraryFlag(value: unknown): UiComponentLibrary | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const library = UiComponentLibrarySchema.safeParse(value);
  if (!library.success) {
    throw new QaError('INIT_OPTION_INVALID', `"${value}" is not valid for --component-library`, {
      remediation: `Use one of: ${UiComponentLibrarySchema.options.join(', ')}.`,
    });
  }
  return library.data;
}

async function dispatchInit(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const values = parseCommandArgs(rest, {
    json: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    'defer-scope': { type: 'boolean', default: false },
    e2e: { type: 'string' },
    api: { type: 'string' },
    a11y: { type: 'string' },
    security: { type: 'string' },
    'source-path': { type: 'string' },
    'api-source': { type: 'string' },
    'a11y-wcag-version': { type: 'string' },
    'a11y-level': { type: 'string' },
    'a11y-best-practices': { type: 'boolean', default: false },
    'component-library': { type: 'string' },
  });
  const json = values.json === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const a11yTarget = parseA11yTarget(values);
  const componentLibrary = parseComponentLibraryFlag(values['component-library']);
  const e2e = parseTestingScopeFlag(typeof values.e2e === 'string' ? values.e2e : undefined, '--e2e');
  const api = parseTestingScopeFlag(typeof values.api === 'string' ? values.api : undefined, '--api');
  const a11y = parseTestingScopeFlag(typeof values.a11y === 'string' ? values.a11y : undefined, '--a11y');
  const security = parseTestingScopeFlag(
    typeof values.security === 'string' ? values.security : undefined,
    '--security',
  );
  const testing: TestingScopeAnswers = {
    ...(e2e !== undefined ? { e2e } : {}),
    ...(api !== undefined ? { api } : {}),
    ...(a11y !== undefined ? { a11y } : {}),
    ...(security !== undefined ? { security } : {}),
  };
  const result = await runInit(context, {
    force: values.force === true,
    deferScope: values['defer-scope'] === true,
    testing,
    ...(typeof values['source-path'] === 'string' ? { sourcePath: values['source-path'] } : {}),
    ...(typeof values['api-source'] === 'string' ? { apiSource: values['api-source'] } : {}),
    ...(a11yTarget !== undefined ? { a11yTarget } : {}),
    ...(componentLibrary !== undefined ? { componentLibrary } : {}),
  });
  printResult(context.io, json, 'init', result, formatInitResult(result));
  return EXIT_SUCCESS;
}

async function dispatchConfig(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const [subcommand, ...subRest] = rest;
  if (subcommand === 'set') {
    return await dispatchConfigSet(subRest, dependencies);
  }
  if (subcommand === 'add') {
    return await dispatchConfigAdd(subRest, dependencies);
  }
  if (subcommand === 'show') {
    return await dispatchConfigShow(subRest, dependencies);
  }
  dependencies.io.stderr(`Unknown "qa config" subcommand "${subcommand ?? ''}".\n\n${USAGE}`);
  return EXIT_USAGE;
}

async function dispatchConfigShow(
  rest: readonly string[],
  dependencies: RunCliDependencies,
): Promise<number> {
  const values = parseCommandArgs(rest, {
    json: { type: 'boolean', default: false },
    explain: { type: 'boolean', default: false },
  });
  const json = values.json === true;
  const explain = values.explain === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const result = await runConfigShow(context);
  const data = {
    config: result.config,
    localLayerPath: result.localLayerPath,
    relaxations: result.relaxations,
    ...(explain ? { values: result.values } : {}),
  };
  printResult(context.io, json, 'config-show', data, formatConfigShowResult(result, explain));
  return EXIT_SUCCESS;
}

async function dispatchConfigSet(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const { values, positionals } = parseArgs({
    args: rest,
    options: { json: { type: 'boolean', default: false }, 'api-source': { type: 'string' } },
    allowPositionals: true,
    strict: true,
  });
  const [key, value] = positionals;
  if (key === undefined || value === undefined) {
    throw new QaError('CONFIG_SET_USAGE', 'Usage: qa config set <key> <value>', {
      remediation: 'Example: qa config set testing.api in-scope or qa config set ui.componentLibrary none',
    });
  }
  const json = values.json;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const result = await runConfigSet(context, {
    key,
    value,
    ...(values['api-source'] === undefined ? {} : { apiSource: values['api-source'] }),
  });
  printResult(context.io, json, 'config-set', result, formatConfigSetResult(result));
  return EXIT_SUCCESS;
}

async function dispatchConfigAdd(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const [target, ...targetRest] = rest;
  if (target === 'environment') {
    return await dispatchConfigAddEnvironment(targetRest, dependencies);
  }
  if (target === 'identity') {
    return await dispatchConfigAddIdentity(targetRest, dependencies);
  }
  if (target === 'api-auth') {
    return await dispatchConfigAddApiAuth(targetRest, dependencies);
  }
  dependencies.io.stderr(`Unknown "qa config add" target "${target ?? ''}".\n\n${USAGE}`);
  return EXIT_USAGE;
}

async function dispatchConfigAddEnvironment(
  rest: readonly string[],
  dependencies: RunCliDependencies,
): Promise<number> {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      json: { type: 'boolean', default: false },
      'base-url': { type: 'string' },
      allowlist: { type: 'string' },
      locale: { type: 'string' },
      'allow-request': { type: 'string', multiple: true },
      'allow-request-reason': { type: 'string' },
      force: { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: true,
  });
  const [name] = positionals;
  if (name === undefined || typeof values['base-url'] !== 'string' || typeof values.allowlist !== 'string') {
    throw new QaError(
      'CONFIG_ADD_USAGE',
      'Usage: qa config add environment <name> --base-url <url> --allowlist <a,b,c> [--locale <tag>] [--allow-request "POST /path" --allow-request-reason <why>]',
      {
        remediation:
          'Example: qa config add environment staging --base-url https://staging.example.com --allowlist staging.example.com',
      },
    );
  }
  const json = values.json;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const allowlist = values.allowlist
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const result = await runConfigAddEnvironment(context, {
    name,
    baseUrl: values['base-url'],
    allowlist,
    ...(values.locale === undefined ? {} : { locale: values.locale }),
    safeNonGetRequests: parseAllowRequests(values['allow-request'], values['allow-request-reason']),
    force: values.force,
  });
  printResult(context.io, json, 'config-add-environment', result, formatConfigAddEnvironmentResult(result));
  return EXIT_SUCCESS;
}

// "POST /auth/refresh-token" (a method, a space, an exact path), each with the one shared reason
// (ADR-0014). The schema decides whether the method and path are acceptable.
function parseAllowRequests(
  entries: readonly string[] | undefined,
  reason: string | undefined,
): { method: string; path: string; reason: string }[] {
  if (entries === undefined || entries.length === 0) {
    return [];
  }
  if (reason === undefined) {
    throw new QaError('CONFIG_ADD_USAGE', '--allow-request needs --allow-request-reason', {
      remediation:
        'Say in a sentence why the request is safe to send, for example --allow-request-reason "Exchanges the refresh cookie for an access token".',
    });
  }
  return entries.map((entry) => {
    const [method = '', path = ''] = entry.trim().split(/\s+/u);
    return { method, path, reason };
  });
}

async function dispatchConfigAddIdentity(
  rest: readonly string[],
  dependencies: RunCliDependencies,
): Promise<number> {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      json: { type: 'boolean', default: false },
      auth: { type: 'string' },
      secret: { type: 'string' },
      'login-url': { type: 'string' },
      username: { type: 'string' },
      force: { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: true,
  });
  const [name] = positionals;
  if (name === undefined || typeof values.auth !== 'string' || typeof values.secret !== 'string') {
    throw new QaError(
      'CONFIG_ADD_USAGE',
      'Usage: qa config add identity <name> --auth <cdp-attach|storage-state> --secret <QA_...>',
      {
        remediation:
          'Example: qa config add identity admin --auth storage-state --secret QA_ADMIN_PASSWORD --login-url https://staging.example.com/login --username admin@example.com',
      },
    );
  }
  const json = values.json;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const result = await runConfigAddIdentity(context, {
    name,
    auth: values.auth,
    secret: values.secret,
    ...(typeof values['login-url'] === 'string' ? { loginUrl: values['login-url'] } : {}),
    ...(typeof values.username === 'string' ? { username: values.username } : {}),
    force: values.force,
  });
  printResult(context.io, json, 'config-add-identity', result, formatConfigAddIdentityResult(result));
  return EXIT_SUCCESS;
}

async function dispatchConfigAddApiAuth(
  rest: readonly string[],
  dependencies: RunCliDependencies,
): Promise<number> {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      json: { type: 'boolean', default: false },
      profile: { type: 'string' },
      'default-for': { type: 'string' },
      force: { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: true,
  });
  const [name] = positionals;
  if (name === undefined || typeof values.profile !== 'string') {
    throw new QaError(
      'CONFIG_ADD_USAGE',
      'Usage: qa config add api-auth <name> --profile <json> [--default-for <environment>] [--force]',
      {
        remediation: `Example: qa config add api-auth staging-api --profile '{"type":"bearer","tokenVariable":"QA_API_TOKEN"}' --default-for staging`,
      },
    );
  }
  let profile: unknown;
  try {
    profile = JSON.parse(values.profile);
  } catch (error) {
    throw new QaError('CONFIG_ADD_USAGE', '--profile is not valid JSON', {
      remediation: 'Pass the profile as one JSON object, quoted for your shell.',
      cause: error,
    });
  }
  const json = values.json;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const result = await runConfigAddApiAuthProfile(context, {
    name,
    profile,
    ...(typeof values['default-for'] === 'string' ? { defaultForEnvironment: values['default-for'] } : {}),
    force: values.force,
  });
  printResult(context.io, json, 'config-add-api-auth', result, formatConfigAddApiAuthResult(result));
  return EXIT_SUCCESS;
}

async function dispatchDoctor(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const values = parseCommandArgs(rest, {
    json: { type: 'boolean', default: false },
    fix: { type: 'boolean', default: false },
  });
  const json = values.json === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const report = await runDoctor(context, { fix: values.fix === true });
  printResult(context.io, json, 'doctor', report, formatDoctorReport(report));
  return report.ok ? EXIT_SUCCESS : EXIT_FAILURE;
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new QaError('EXPLORE_OPTION_INVALID', `"${value}" is not a positive integer for ${flag}`);
  }
  return parsed;
}

async function dispatchExplore(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const values = parseCommandArgs(rest, {
    json: { type: 'boolean', default: false },
    environment: { type: 'string' },
    identity: { type: 'string' },
    'cdp-endpoint': { type: 'string' },
    policy: { type: 'string' },
    static: { type: 'boolean', default: false },
    pick: { type: 'string' },
    'max-pages': { type: 'string' },
    url: { type: 'string', multiple: true },
    'probe-navigation': { type: 'boolean', default: false },
    'expand-collapsed': { type: 'boolean', default: false },
    verify: { type: 'boolean', default: false },
  });
  const json = values.json === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const report = await runExplore(context, {
    ...(typeof values.environment === 'string' ? { environment: values.environment } : {}),
    ...(typeof values.identity === 'string' ? { identity: values.identity } : {}),
    ...(typeof values['cdp-endpoint'] === 'string' ? { cdpEndpointUrl: values['cdp-endpoint'] } : {}),
    ...(typeof values.policy === 'string' ? { policy: values.policy } : {}),
    static: values.static === true,
    ...(typeof values.pick === 'string' ? { pick: values.pick } : {}),
    ...(typeof values['max-pages'] === 'string'
      ? { maxPages: parsePositiveInt(values['max-pages'], '--max-pages') }
      : {}),
    ...(Array.isArray(values.url) && values.url.length > 0 ? { startUrls: values.url as string[] } : {}),
    ...(values['probe-navigation'] === true ? { probeNavigation: true } : {}),
    ...(values['expand-collapsed'] === true ? { expandCollapsed: true } : {}),
    verify: values.verify === true,
  });
  printResult(context.io, json, 'explore', report, formatExploreReport(report));
  return report.degraded.length > 0 ? EXIT_FAILURE : EXIT_SUCCESS;
}

async function dispatchApiDiff(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const values = parseCommandArgs(rest, {
    json: { type: 'boolean', default: false },
    environment: { type: 'string' },
  });
  const json = values.json === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const summary = await runApiDiff(context, {
    ...(typeof values.environment === 'string' ? { environment: values.environment } : {}),
  });
  printResult(context.io, json, 'api-diff', summary, formatApiDiffSummary(summary));
  return EXIT_SUCCESS;
}

async function dispatchScope(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const values = parseCommandArgs(rest, {
    json: { type: 'boolean', default: false },
    from: { type: 'string' },
    path: { type: 'string' },
    content: { type: 'string' },
    label: { type: 'string' },
  });
  if (typeof values.from !== 'string') {
    throw new QaError(
      'SCOPE_USAGE',
      'Usage: qa scope --from <file|text> [--path <path>] [--content <text>] [--label <label>]',
      { remediation: 'Example: qa scope --from file --path docs/requirements.md' },
    );
  }
  const json = values.json === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const result = await runScope(context, {
    from: values.from,
    ...(typeof values.path === 'string' ? { path: values.path } : {}),
    ...(typeof values.content === 'string' ? { content: values.content } : {}),
    ...(typeof values.label === 'string' ? { label: values.label } : {}),
  });
  printResult(context.io, json, 'scope', result, formatScopeResult(result));
  return EXIT_SUCCESS;
}

async function dispatchCases(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const [subcommand, ...subRest] = rest;
  if (subcommand === 'add') {
    return await dispatchCasesAdd(subRest, dependencies);
  }
  if (subcommand === 'render') {
    return await dispatchCasesRender(subRest, dependencies);
  }
  dependencies.io.stderr(`Unknown "qa cases" subcommand "${subcommand ?? ''}".\n\n${USAGE}`);
  return EXIT_USAGE;
}

async function dispatchCasesAdd(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const values = parseCommandArgs(rest, {
    json: { type: 'boolean', default: false },
    path: { type: 'string' },
  });
  const json = values.json === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const result = await runCasesAdd(context, {
    ...(typeof values.path === 'string' ? { path: values.path } : {}),
  });
  printResult(context.io, json, 'cases-add', result, formatCasesAddResult(result));
  return EXIT_SUCCESS;
}

async function dispatchCasesRender(
  rest: readonly string[],
  dependencies: RunCliDependencies,
): Promise<number> {
  const { values, positionals } = parseArgs({
    args: rest,
    options: { json: { type: 'boolean', default: false } },
    allowPositionals: true,
    strict: true,
  });
  const [id] = positionals;
  const json = values.json;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const result = await runCasesRender(context, { ...(id !== undefined ? { id } : {}) });
  printResult(context.io, json, 'cases-render', result, formatCasesRenderResult(result));
  return EXIT_SUCCESS;
}

async function dispatchTestData(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const [subcommand, ...subRest] = rest;
  if (subcommand === 'add') {
    return await dispatchTestDataAdd(subRest, dependencies);
  }
  dependencies.io.stderr(`Unknown "qa test-data" subcommand "${subcommand ?? ''}".\n\n${USAGE}`);
  return EXIT_USAGE;
}

async function dispatchTestDataAdd(
  rest: readonly string[],
  dependencies: RunCliDependencies,
): Promise<number> {
  const values = parseCommandArgs(rest, {
    json: { type: 'boolean', default: false },
    path: { type: 'string' },
  });
  const json = values.json === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const result = await runTestDataAdd(context, {
    ...(typeof values.path === 'string' ? { path: values.path } : {}),
  });
  printResult(context.io, json, 'test-data-add', result, formatTestDataAddResult(result));
  return EXIT_SUCCESS;
}

function parseTestType(value: string | undefined): TestType | undefined {
  if (value === undefined) {
    return undefined;
  }
  const result = TestTypeSchema.safeParse(value);
  if (!result.success) {
    throw new QaError('RUN_OPTION_INVALID', `"${value}" is not valid for --test-type`, {
      remediation: `Use one of: ${TestTypeSchema.options.join(', ')}.`,
    });
  }
  return result.data;
}

async function dispatchRun(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const { values } = parseArgs({
    args: [...rest],
    options: {
      json: { type: 'boolean', default: false },
      spec: { type: 'string', multiple: true },
      'test-type': { type: 'string' },
      environment: { type: 'string' },
      identity: { type: 'string' },
    },
    allowPositionals: false,
    strict: true,
  });
  const specFiles = values.spec ?? [];
  if (specFiles.length === 0) {
    throw new QaError('RUN_USAGE', 'Usage: qa run --spec <path> [--spec <path> ...]', {
      remediation: 'Example: qa run --spec tests/login.playwright-spec.ts',
    });
  }
  const testType = parseTestType(values['test-type']);
  const json = values.json;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const summary = await runRun(context, {
    specFiles,
    ...(testType !== undefined ? { testType } : {}),
    ...(typeof values.environment === 'string' ? { environment: values.environment } : {}),
    ...(typeof values.identity === 'string' ? { identity: values.identity } : {}),
  });
  printResult(context.io, json, 'run', summary, formatRunSummary(summary));
  const hasFailure =
    summary.counts.failed > 0 ||
    summary.counts.blocked > 0 ||
    summary.counts.uncertain > 0 ||
    summary.counts.partial > 0;
  return hasFailure ? EXIT_FAILURE : EXIT_SUCCESS;
}

async function dispatchSpec(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const [subcommand, ...subRest] = rest;
  if (subcommand !== 'check') {
    dependencies.io.stderr(`Unknown "qa spec" subcommand "${subcommand ?? ''}".

${USAGE}`);
    return EXIT_USAGE;
  }
  const { values } = parseArgs({
    args: [...subRest],
    options: {
      json: { type: 'boolean', default: false },
      spec: { type: 'string', multiple: true },
      'test-type': { type: 'string' },
      environment: { type: 'string' },
      identity: { type: 'string' },
    },
    allowPositionals: false,
    strict: true,
  });
  const specFiles = values.spec ?? [];
  if (specFiles.length === 0) {
    throw new QaError('SPEC_CHECK_USAGE', 'Usage: qa spec check --spec <path> [--spec <path> ...]', {
      remediation: 'Example: qa spec check --spec tests/qa/generated/login.spec.ts',
    });
  }
  const testType = parseTestType(values['test-type']);
  const json = values.json;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const summary = await runSpecCheckCommand(context, {
    specFiles,
    ...(testType !== undefined ? { testType } : {}),
    ...(typeof values.environment === 'string' ? { environment: values.environment } : {}),
    ...(typeof values.identity === 'string' ? { identity: values.identity } : {}),
  });
  printResult(context.io, json, 'spec-check', summary, [
    `Checked ${String(summary.results.length)} test(s), nothing recorded:`,
    ...summary.results.map((result) => `  ${result.testCaseId}: ${result.status}`),
  ]);
  const hasFailure =
    summary.counts.failed > 0 ||
    summary.counts.blocked > 0 ||
    summary.counts.uncertain > 0 ||
    summary.counts.partial > 0;
  return hasFailure ? EXIT_FAILURE : EXIT_SUCCESS;
}

async function dispatchLink(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      json: { type: 'boolean', default: false },
      feature: { type: 'string' },
      'test-type': { type: 'string' },
    },
    allowPositionals: true,
    strict: true,
  });
  const [specFile, requirementId] = positionals;
  const testType = parseTestType(values['test-type']);
  const json = values.json;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const result = await runLink(context, {
    ...(specFile !== undefined ? { specFile } : {}),
    ...(requirementId !== undefined ? { requirementId } : {}),
    ...(typeof values.feature === 'string' ? { feature: values.feature } : {}),
    ...(testType !== undefined ? { testType } : {}),
  });
  printResult(context.io, json, 'link', result, formatLinkResult(result));
  return EXIT_SUCCESS;
}

function parseReportFormat(value: string | undefined): ReportFormat | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value !== 'markdown' && value !== 'html') {
    throw new QaError('REPORT_OPTION_INVALID', `"${value}" is not valid for --format`, {
      remediation: 'Use one of: markdown, html.',
    });
  }
  return value;
}

// `--output` may stand alone (the default path) or take a path; `parseArgs` insists on a value, so a
// bare flag is given an empty one first.
function withBareOutputFlag(rest: readonly string[]): readonly string[] {
  return rest.flatMap((argument, index) => {
    const next = rest[index + 1];
    const isBare = argument === '--output' && (next === undefined || next.startsWith('--'));
    return isBare ? [argument, ''] : [argument];
  });
}

async function dispatchReport(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const values = parseCommandArgs(withBareOutputFlag(rest), {
    json: { type: 'boolean', default: false },
    run: { type: 'string' },
    format: { type: 'string' },
    output: { type: 'string' },
  });
  const format = parseReportFormat(typeof values.format === 'string' ? values.format : undefined);
  const json = values.json === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const result = await runReport(context, {
    ...(typeof values.run === 'string' ? { runId: values.run } : {}),
    ...(format !== undefined ? { format } : {}),
    ...(typeof values.output === 'string' ? { output: values.output === '' ? true : values.output } : {}),
  });
  printResult(context.io, json, 'report', result, formatReportResult(result));
  return EXIT_SUCCESS;
}

async function dispatchDefect(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const [subcommand, ...subRest] = rest;
  if (subcommand === 'add') {
    return await dispatchDefectAdd(subRest, dependencies);
  }
  if (subcommand === 'accept') {
    return await dispatchDefectAccept(subRest, dependencies);
  }
  dependencies.io.stderr(`Unknown "qa defect" subcommand "${subcommand ?? ''}".\n\n${USAGE}`);
  return EXIT_USAGE;
}

async function dispatchDefectAdd(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const values = parseCommandArgs(rest, {
    json: { type: 'boolean', default: false },
    path: { type: 'string' },
  });
  const json = values.json === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const result = await runDefectAdd(context, {
    ...(typeof values.path === 'string' ? { path: values.path } : {}),
  });
  printResult(context.io, json, 'defect-add', result, formatDefectAddResult(result));
  return EXIT_SUCCESS;
}

async function dispatchDefectAccept(
  rest: readonly string[],
  dependencies: RunCliDependencies,
): Promise<number> {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      json: { type: 'boolean', default: false },
      'approved-by': { type: 'string' },
      note: { type: 'string' },
    },
    allowPositionals: true,
    strict: true,
  });
  const [id] = positionals;
  const json = values.json;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const result = await runDefectAccept(context, {
    ...(id !== undefined ? { id } : {}),
    ...(typeof values['approved-by'] === 'string' ? { approvedBy: values['approved-by'] } : {}),
    ...(typeof values.note === 'string' ? { note: values.note } : {}),
  });
  printResult(context.io, json, 'defect-accept', result, formatDefectAcceptResult(result));
  return EXIT_SUCCESS;
}

async function dispatchAgents(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const [subcommand, ...subRest] = rest;
  if (subcommand !== 'generate') {
    dependencies.io.stderr(`Unknown "qa agents" subcommand "${subcommand ?? ''}".

${USAGE}`);
    return EXIT_USAGE;
  }
  const values = parseCommandArgs(subRest, { json: { type: 'boolean', default: false } });
  const json = values.json === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const result = await runAgentsGenerate(context);
  printResult(context.io, json, 'agents-generate', result, formatAgentsGenerateResult(result));
  return EXIT_SUCCESS;
}

async function dispatchRegression(
  rest: readonly string[],
  dependencies: RunCliDependencies,
): Promise<number> {
  const [subcommand, ...subRest] = rest;
  if (subcommand !== 'plan') {
    dependencies.io.stderr(`Unknown "qa regression" subcommand "${subcommand ?? ''}".

${USAGE}`);
    return EXIT_USAGE;
  }
  const values = parseCommandArgs(subRest, {
    json: { type: 'boolean', default: false },
    'max-tier': { type: 'string' },
  });
  const json = values.json === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const plan = await runRegressionPlan(context, {
    ...(typeof values['max-tier'] === 'string' ? { maxTier: values['max-tier'] } : {}),
  });
  printResult(context.io, json, 'regression-plan', plan, formatRegressionPlan(plan));
  return EXIT_SUCCESS;
}

async function dispatchMetrics(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const values = parseCommandArgs(rest, {
    json: { type: 'boolean', default: false },
    run: { type: 'string' },
  });
  const json = values.json === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const metrics = await runRunMetrics(context, {
    ...(typeof values.run === 'string' ? { runId: values.run } : {}),
  });
  printResult(context.io, json, 'metrics', metrics, renderRunMetricsMarkdown(metrics).trimEnd().split('\n'));
  return EXIT_SUCCESS;
}

async function dispatchReview(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const [subcommand, ...subRest] = rest;
  if (subcommand !== 'add') {
    dependencies.io.stderr(`Unknown "qa review" subcommand "${subcommand ?? ''}".

${USAGE}`);
    return EXIT_USAGE;
  }
  const values = parseCommandArgs(subRest, {
    json: { type: 'boolean', default: false },
    path: { type: 'string' },
  });
  const json = values.json === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const result = await runReviewAdd(context, {
    ...(typeof values.path === 'string' ? { path: values.path } : {}),
  });
  printResult(context.io, json, 'review-add', result, [
    `Registered ${result.reviewPath} (${result.verdict}).`,
  ]);
  return EXIT_SUCCESS;
}

async function dispatchTriage(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const [subcommand, ...subRest] = rest;
  if (subcommand !== 'add') {
    dependencies.io.stderr(`Unknown "qa triage" subcommand "${subcommand ?? ''}".

${USAGE}`);
    return EXIT_USAGE;
  }
  const values = parseCommandArgs(subRest, {
    json: { type: 'boolean', default: false },
    path: { type: 'string' },
  });
  const json = values.json === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const result = await runTriageAdd(context, {
    ...(typeof values.path === 'string' ? { path: values.path } : {}),
  });
  printResult(context.io, json, 'triage-add', result, [
    `Registered ${result.triagePath} (${String(result.entryCount)} classified failure(s)).`,
  ]);
  return EXIT_SUCCESS;
}

async function dispatchRca(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const [subcommand, ...subRest] = rest;
  if (subcommand === 'add') {
    return await dispatchRcaAdd(subRest, dependencies);
  }
  if (subcommand === 'approve') {
    return await dispatchRcaApprove(subRest, dependencies);
  }
  dependencies.io.stderr(`Unknown "qa rca" subcommand "${subcommand ?? ''}".\n\n${USAGE}`);
  return EXIT_USAGE;
}

async function dispatchRcaAdd(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const values = parseCommandArgs(rest, {
    json: { type: 'boolean', default: false },
    path: { type: 'string' },
  });
  const json = values.json === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const result = await runRcaAdd(context, {
    ...(typeof values.path === 'string' ? { path: values.path } : {}),
  });
  printResult(context.io, json, 'rca-add', result, formatRcaAddResult(result));
  return EXIT_SUCCESS;
}

async function dispatchRcaApprove(
  rest: readonly string[],
  dependencies: RunCliDependencies,
): Promise<number> {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      json: { type: 'boolean', default: false },
      'approved-by': { type: 'string' },
      note: { type: 'string' },
    },
    allowPositionals: true,
    strict: true,
  });
  const [defectId] = positionals;
  const json = values.json;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const result = await runRcaApprove(context, {
    ...(defectId !== undefined ? { defectId } : {}),
    ...(typeof values['approved-by'] === 'string' ? { approvedBy: values['approved-by'] } : {}),
    ...(typeof values.note === 'string' ? { note: values.note } : {}),
  });
  printResult(context.io, json, 'rca-approve', result, formatRcaApproveResult(result));
  return EXIT_SUCCESS;
}

async function dispatchSecurity(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const [subcommand, ...subRest] = rest;
  if (subcommand === 'authorize') {
    return await dispatchSecurityAuthorize(subRest, dependencies);
  }
  if (subcommand === 'approve') {
    return await dispatchSecurityApprove(subRest, dependencies);
  }
  if (subcommand === 'audit') {
    return await dispatchSecurityAudit(subRest, dependencies);
  }
  dependencies.io.stderr(`Unknown "qa security" subcommand "${subcommand ?? ''}".\n\n${USAGE}`);
  return EXIT_USAGE;
}

async function dispatchSecurityAuthorize(
  rest: readonly string[],
  dependencies: RunCliDependencies,
): Promise<number> {
  const values = parseCommandArgs(rest, {
    json: { type: 'boolean', default: false },
    path: { type: 'string' },
  });
  const json = values.json === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const result = await runSecurityAuthorizationAdd(context, {
    ...(typeof values.path === 'string' ? { path: values.path } : {}),
  });
  printResult(context.io, json, 'security-authorize', result, formatSecurityAuthorizeResult(result));
  return EXIT_SUCCESS;
}

async function dispatchSecurityApprove(
  rest: readonly string[],
  dependencies: RunCliDependencies,
): Promise<number> {
  const values = parseCommandArgs(rest, {
    json: { type: 'boolean', default: false },
    'approved-by': { type: 'string' },
    note: { type: 'string' },
  });
  const json = values.json === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const result = await runSecurityAuthorizationApprove(context, {
    ...(typeof values['approved-by'] === 'string' ? { approvedBy: values['approved-by'] } : {}),
    ...(typeof values.note === 'string' ? { note: values.note } : {}),
  });
  printResult(context.io, json, 'security-approve', result, formatSecurityApproveResult(result));
  return EXIT_SUCCESS;
}

async function dispatchSecurityAudit(
  rest: readonly string[],
  dependencies: RunCliDependencies,
): Promise<number> {
  const values = parseCommandArgs(rest, { json: { type: 'boolean', default: false } });
  const json = values.json === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const summary = await runSecurityAuditCommand(context);
  printResult(context.io, json, 'security-audit', summary, formatSecurityAuditSummary(summary));
  // A partial audit is not a clean bill, and an audit with findings has something to review.
  return summary.status === 'completed' && summary.findingCount === 0 ? EXIT_SUCCESS : EXIT_FAILURE;
}

async function dispatchApprove(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      json: { type: 'boolean', default: false },
      artifact: { type: 'string' },
      'approved-by': { type: 'string' },
      note: { type: 'string' },
    },
    allowPositionals: true,
    strict: true,
  });
  const [gate] = positionals;
  if (
    gate === undefined ||
    typeof values.artifact !== 'string' ||
    typeof values['approved-by'] !== 'string'
  ) {
    throw new QaError('APPROVE_USAGE', 'Usage: qa approve <gate> --artifact <path> --approved-by <name>', {
      remediation: 'Example: qa approve scope --artifact artifacts/scope.json --approved-by operator',
    });
  }
  const json = values.json;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const result = await runApprove(context, {
    gate,
    artifactPath: values.artifact,
    approvedBy: values['approved-by'],
    ...(typeof values.note === 'string' ? { note: values.note } : {}),
  });
  printResult(context.io, json, 'approve', result, formatApproveResult(result));
  return EXIT_SUCCESS;
}

async function dispatchStatus(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const values = parseCommandArgs(rest, { json: { type: 'boolean', default: false } });
  const json = values.json === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const report = await runStatus(context);
  printResult(context.io, json, 'status', report, formatStatusReport(report));
  return EXIT_SUCCESS;
}

async function dispatchValidate(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const values = parseCommandArgs(rest, {
    json: { type: 'boolean', default: false },
    run: { type: 'boolean', default: false },
  });
  const json = values.json === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const report = await runValidate(context, { checkRuns: values.run === true });
  printResult(context.io, json, 'validate', report, formatValidateReport(report));
  const hasFailure =
    report.reopened.length > 0 ||
    report.unlinkedCases.length > 0 ||
    report.unresolvedTestData.length > 0 ||
    report.tamperedArtifacts.length > 0 ||
    (report.unresolvedResultEvidence?.length ?? 0) > 0 ||
    (report.resultsMissingEvidence?.length ?? 0) > 0;
  return hasFailure ? EXIT_FAILURE : EXIT_SUCCESS;
}

function printResult(
  io: CliIO,
  json: boolean,
  command: string,
  data: unknown,
  humanLines: readonly string[],
): void {
  if (json) {
    io.stdout(JSON.stringify({ command, data }));
    return;
  }
  for (const line of humanLines) {
    io.stdout(line);
  }
}

function formatInitResult(result: InitResult): readonly string[] {
  if (result.alreadyInitialized && result.created.length === 0) {
    return [`${result.qaDir} already initialized; nothing to do.`];
  }
  return [`Initialized ${result.qaDir}`, ...result.created.map((file) => `  wrote ${file}`)];
}

function formatConfigSetResult(result: ConfigSetResult): readonly string[] {
  return [`Set ${result.key} = ${result.value}`];
}

function formatConfigAddEnvironmentResult(result: ConfigAddEnvironmentResult): readonly string[] {
  return [
    `Added environment "${result.name}": ${result.environment.baseUrl} (allowlist: ${result.environment.allowlist.join(', ')})`,
  ];
}

function formatConfigAddApiAuthResult(result: ConfigAddApiAuthProfileResult): readonly string[] {
  return [
    `Added API auth profile "${result.name}": type=${result.profile.type}${
      result.defaultForEnvironment === undefined ? '' : `, default for "${result.defaultForEnvironment}"`
    }`,
  ];
}

function formatConfigAddIdentityResult(result: ConfigAddIdentityResult): readonly string[] {
  return [`Added identity "${result.name}": auth=${result.identity.auth}, secret=${result.identity.secret}`];
}

const COMMITTED_LAYER_LABEL = '.qa/config.yaml';

// A value is only ever labeled "local" when `loadLayeredConfig` found a local layer file, so
// `localLayerPath` is always defined here; both are set from the same condition (config-loader.ts).
function describeConfigValueOrigin(layer: ConfigValueLayer, localLayerPath: string | undefined): string {
  if (layer === 'committed') {
    return COMMITTED_LAYER_LABEL;
  }
  if (layer === 'default') {
    return 'default';
  }
  // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
  return localLayerPath as string;
}

function formatConfigShowValue(value: ConfigShowValue, localLayerPath: string | undefined): string {
  const origin = describeConfigValueOrigin(value.layer, localLayerPath);
  return `${value.path.join('.')} = ${JSON.stringify(value.value)}  (${origin})`;
}

function formatConfigShowResult(result: ConfigShowResult, explain: boolean): readonly string[] {
  const lines: string[] = [`Local layer: ${result.localLayerPath ?? 'none'}`];
  if (explain) {
    lines.push(...result.values.map((value) => formatConfigShowValue(value, result.localLayerPath)));
  } else {
    lines.push(stringifyYaml(result.config).trimEnd());
  }
  if (result.relaxations.length === 0) {
    lines.push('No relaxations.');
  } else {
    lines.push(...result.relaxations.map((relaxation) => formatConfigRelaxation(relaxation)));
  }
  return lines;
}

function formatDoctorReport(report: DoctorReport): readonly string[] {
  const checkLines = report.checks.map((check) => {
    const marker = check.status === 'pass' ? 'PASS' : 'FAIL';
    const remediation = check.remediation !== undefined ? ` — ${check.remediation}` : '';
    return `[${marker}] ${check.name}: ${check.message}${remediation}`;
  });
  return [...checkLines, ...report.relaxations.map((relaxation) => formatConfigRelaxation(relaxation))];
}

function formatExploreReport(report: ExploreReport): readonly string[] {
  if (report.mode === 'verify') {
    const lines = [
      `Verified ${report.registryPath}: ${String(report.elementCount)} element(s) checked.`,
      ...formatOtherEnvironments(report),
    ];
    if (report.degraded.length === 0) {
      lines.push('No degraded selectors.');
      return lines;
    }
    lines.push(`${String(report.degraded.length)} degraded selector(s):`);
    for (const element of report.degraded) {
      lines.push(
        `  ${element.elementId}: ${String(element.previousScore)} -> ${String(element.currentScore)}`,
      );
    }
    return lines;
  }
  return [
    `Wrote ${report.registryPath}: ${String(report.elementCount)} element(s) (` +
      `${String(report.added)} added, ${String(report.removed)} removed, ${String(report.degraded.length)} degraded).`,
    ...formatOtherEnvironments(report),
    `${String(report.missingLocatorCount)} element(s) with no locator candidate.`,
    ...formatBlockedRequestCounts(report),
    ...(report.navigationProbeCount === undefined
      ? []
      : [`${String(report.navigationProbeCount)} navigation control(s) clicked in isolated contexts.`]),
    ...(report.expandedPanelCount === undefined
      ? []
      : [`${String(report.expandedPanelCount)} collapsed panel(s) opened in isolated contexts.`]),
    ...formatRequestSummaries('Let through by the environment (safeNonGetRequests)', report.allowedRequests),
    ...BLOCKED_REQUEST_REASONS.flatMap((reason) =>
      formatRequestSummaries(
        BLOCKED_REQUEST_REASON_TEXT[reason].heading,
        report.blockedRequests.filter((entry) => entry.reason === reason),
      ),
    ),
  ];
}

// What each reason means to an operator, and where its remedy is: only a blocked method can be
// answered with `safeNonGetRequests`; a blocked origin is a matter of the environment's allowlist
// and baseUrl, so pointing it at the method list would send the operator to the wrong setting.
const BLOCKED_REQUEST_REASON_TEXT: Readonly<
  Record<BlockedRequestReason, { cause: string; heading: string }>
> = {
  method: {
    cause: `their method is not allowed (safe mode lets ${[...SAFE_HTTP_METHODS].join(', ')} through)`,
    heading: 'Blocked by method (an application that stalls may need one listed in safeNonGetRequests)',
  },
  host: {
    cause: "their host is not on the environment's allowlist",
    heading:
      "Blocked, host not on the allowlist (add the host to the environment's allowlist if it belongs in scope)",
  },
  scheme: {
    cause: "their scheme differs from the environment's baseUrl",
    heading: 'Blocked, scheme differs from baseUrl (an environment uses one scheme for every allowed host)',
  },
  port: {
    cause: "their port is neither the environment's baseUrl port nor one its allowlist names for that host",
    heading:
      "Blocked, port not allowed (add host:port to the environment's allowlist if that port belongs in scope)",
  },
};

// The counts above describe one environment; the rest of the registry is not touched (ADR-0020).
function formatOtherEnvironments(report: ExploreReport): readonly string[] {
  return report.otherEnvironmentElementCount === 0
    ? []
    : [`${String(report.otherEnvironmentElementCount)} element(s) of other environments left as they were.`];
}

function formatBlockedRequestCounts(report: ExploreReport): readonly string[] {
  const lines = BLOCKED_REQUEST_REASONS.filter((reason) => report.blockedRequestCounts[reason] > 0).map(
    (reason) =>
      `${String(report.blockedRequestCounts[reason])} request(s) blocked because ${BLOCKED_REQUEST_REASON_TEXT[reason].cause}.`,
  );
  return lines.length === 0 ? ['0 request(s) blocked by safe mode.'] : lines;
}

function formatRequestSummaries(heading: string, summaries: readonly RequestSummary[]): readonly string[] {
  if (summaries.length === 0) {
    return [];
  }
  return [
    `${heading}:`,
    ...summaries.map((entry) => `  ${entry.method} ${entry.path} x${String(entry.count)}`),
  ];
}

function formatApiDiffSummary(summary: ApiDiffSummary): readonly string[] {
  const { counts } = summary;
  return [
    `Wrote ${summary.reportPath} against ${summary.contractSource} (sha256 ${summary.contractSha256}).`,
    `${String(counts.matched)} matched, ${String(counts.undocumented)} undocumented, ` +
      `${String(counts.methodNotDocumented)} method not documented, ${String(counts.unobserved)} unobserved.`,
  ];
}

function formatScopeResult(result: ScopeResult): readonly string[] {
  return [
    `Wrote ${result.scopePath}: ${String(result.total)} requirement(s) (${String(result.added)} added, ${String(result.updated)} updated).`,
  ];
}

function formatCasesAddResult(result: CasesAddResult): readonly string[] {
  return [
    `Registered ${result.casePath}: linked to ${result.requirementIds.join(', ')}.`,
    `Readable copy for review: ${result.markdownPath}.`,
  ];
}

function formatCasesRenderResult(result: CasesRenderResult): readonly string[] {
  return result.markdown.split('\n');
}

function formatTestDataAddResult(result: TestDataAddResult): readonly string[] {
  return [`Registered ${result.testDataPath}.`];
}

function formatLinkResult(result: LinkResult): readonly string[] {
  const lines = [`Registered ${result.casePath}: linked to ${result.requirementId}.`];
  if (!result.annotationFound) {
    lines.push(
      `No "testCaseId" annotation found in the spec; add test(title, { annotation: { type: 'testCaseId', description: '${result.testCaseId}' } }, ...) so a future "qa run" attributes its result to this case.`,
    );
  }
  return lines;
}

// `runTestRun` (RUN_NO_RESULTS, P3-19) now rejects a run with zero results before returning, so
// `total` here is always at least 1 and `countsLine` is never empty.
function formatRunSummary(summary: RunSummary): readonly string[] {
  const total = Object.values(summary.counts).reduce((sum, count) => sum + count, 0);
  const countsLine = Object.entries(summary.counts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${status}: ${String(count)}`)
    .join(', ');
  return [
    `Run ${summary.runId}: ${String(total)} result(s) (${countsLine}).`,
    ...(summary.identity === undefined ? [] : [`Signed in as identity "${summary.identity}".`]),
    `Wrote ${summary.runRecordPath}.`,
  ];
}

function formatReportResult(result: ReportResult): readonly string[] {
  const saved =
    result.reportPath === undefined ? [] : [`Saved the run-result report to ${result.reportPath}.`, ''];
  return [...saved, ...formatReportSections(result)];
}

function formatReportSections(result: ReportResult): readonly string[] {
  const sections = [
    result.runSummary,
    result.interactiveSummary,
    result.traceabilityMatrix,
    result.a11yConformance,
  ].filter((section) => section !== undefined);
  return sections.flatMap((section, index) => [...(index === 0 ? [] : ['']), ...section.split('\n')]);
}

function formatDefectAddResult(result: DefectAddResult): readonly string[] {
  return [`Registered ${result.defectPath} as a draft.`];
}

function formatDefectAcceptResult(result: DefectAcceptResult): readonly string[] {
  return [
    result.wasAlreadyAccepted
      ? `Defect "${result.id}" was already accepted.`
      : `Accepted defect "${result.id}".`,
  ];
}

function formatRegressionPlan(plan: RegressionPlan): readonly string[] {
  return [
    `Regression pack up to "${plan.maxTier}": ${String(plan.included.length)} case(s) in, ${String(plan.excluded.length)} out.`,
    ...plan.included.map(
      (entry) =>
        `  in  ${entry.testCaseId} (${entry.tier}): ${entry.route === 'spec' ? `run ${String(entry.specPath)}` : `execute live (${entry.routeReason})`}`,
    ),
    ...plan.excluded.map((entry) => `  out ${entry.testCaseId}: ${entry.reason}`),
  ];
}

function formatAgentsGenerateResult(result: AgentsGenerateResult): readonly string[] {
  return [
    `Wrote ${String(result.subagents.length)} subagents to ${result.directory}:`,
    ...result.subagents.map((subagent) => `  ${subagent.path}  model: ${subagent.model}`),
    'Hosts whose subagents take no model (Codex) ignore agents.models.',
  ];
}

function formatRcaAddResult(result: RcaAddResult): readonly string[] {
  return [`Registered ${result.rcaPath} as a draft.`];
}

function formatSecurityAuthorizeResult(result: SecurityAuthorizationAddResult): readonly string[] {
  return [
    `Registered the security audit authorization for "${result.environment}" (${result.checks.join(', ')}).`,
    'It is not consent yet: the operator approves it with "qa security approve --approved-by <name>".',
  ];
}

function formatSecurityApproveResult(result: SecurityAuthorizationApproveResult): readonly string[] {
  return [
    result.wasAlreadyApproved
      ? 'The security audit authorization was already approved.'
      : 'Approved the security audit authorization.',
  ];
}

function formatSecurityAuditSummary(summary: SecurityAuditSummary): readonly string[] {
  return [
    `Security audit ${summary.auditId} of "${summary.environment}": ${summary.status}, ${String(summary.findingCount)} finding(s), ${String(summary.requestCount)} request(s).`,
    ...summary.checks.map((entry) => `  ${entry.checkClass}: ${entry.status}  ${entry.note}`.trimEnd()),
    ...(summary.stoppedReason === undefined ? [] : [`Stopped early: ${summary.stoppedReason}.`]),
    ...(summary.draftIds.length === 0
      ? []
      : [`Defect drafts to review: ${summary.draftIds.join(', ')} (accept with "qa defect accept").`]),
    `Evidence: ${summary.evidencePath}`,
  ];
}

function formatRcaApproveResult(result: RcaApproveResult): readonly string[] {
  return [
    result.wasAlreadyApproved
      ? `The RCA for "${result.defectId}" was already approved.`
      : `Approved the RCA for "${result.defectId}".`,
  ];
}

function formatApproveResult(result: ApproveResult): readonly string[] {
  return [
    `Approved "${result.gate}": ${result.state.gates[result.gate].status}.`,
    `Current phase: ${result.state.currentPhase}.`,
  ];
}

function formatStatusReport(report: StatusReport): readonly string[] {
  const lines = PHASES.map((phase) => `[${report.state.gates[phase].status}] ${phase}`);
  if (report.nextActions.length === 0) {
    lines.push('Nothing left to do: every approved case has a passing result and a generated spec.');
    return lines;
  }
  lines.push('Next:');
  report.nextActions.forEach((action, index) => {
    lines.push(`  ${String(index + 1)}. ${action.title}: ${action.detail}`);
    lines.push(`     skill ${action.skill}, starting with ${action.tool}`);
    if (action.cases !== undefined) {
      const more = action.cases.total - action.cases.ids.length;
      lines.push(`     cases: ${action.cases.ids.join(', ')}${more > 0 ? ` and ${String(more)} more` : ''}`);
    }
  });
  return lines;
}

function formatValidateReport(report: ValidateReport): readonly string[] {
  const lines = PHASES.map((phase) => {
    const status = report.state.gates[phase].status;
    const reopened = report.reopened.includes(phase) ? ' (reopened since last approval)' : '';
    return `[${status}] ${phase}${reopened}`;
  });
  lines.push(`Current phase: ${report.state.currentPhase}.`);
  if (report.unlinkedCases.length === 0) {
    lines.push('No unlinked cases.');
  } else {
    lines.push(`${String(report.unlinkedCases.length)} unlinked case(s):`);
    for (const unlinkedCase of report.unlinkedCases) {
      lines.push(`  ${unlinkedCase.casePath}: ${unlinkedCase.unlinkedRequirementIds.join(', ')}`);
    }
  }
  if (report.unresolvedTestData.length === 0) {
    lines.push('No unresolved test data.');
  } else {
    lines.push(`${String(report.unresolvedTestData.length)} case(s) with unresolved test data:`);
    for (const unresolved of report.unresolvedTestData) {
      lines.push(`  ${unresolved.casePath}: ${unresolved.unresolvedTestDataRefs.join(', ')}`);
    }
  }
  if (report.tamperedArtifacts.length === 0) {
    lines.push('No tampered artifacts.');
  } else {
    lines.push(`${String(report.tamperedArtifacts.length)} tampered artifact(s):`);
    for (const artifactPath of report.tamperedArtifacts) {
      lines.push(`  ${artifactPath}`);
    }
  }
  if (report.unresolvedResultEvidence !== undefined) {
    if (report.unresolvedResultEvidence.length === 0) {
      lines.push('No unresolved result evidence.');
    } else {
      lines.push(`${String(report.unresolvedResultEvidence.length)} result(s) with unresolved evidence:`);
      for (const issue of report.unresolvedResultEvidence) {
        lines.push(`  ${issue.resultPath}: ${issue.unresolvedEvidenceIds.join(', ')}`);
      }
    }
  }
  if (report.resultsMissingEvidence !== undefined) {
    if (report.resultsMissingEvidence.length === 0) {
      lines.push('No failed results missing evidence.');
    } else {
      lines.push(`${String(report.resultsMissingEvidence.length)} failed result(s) missing evidence:`);
      for (const issue of report.resultsMissingEvidence) {
        lines.push(`  ${issue.resultPath}`);
      }
    }
  }
  return lines;
}
