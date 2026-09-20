// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { parseArgs, type ParseArgsConfig } from 'node:util';
import { PHASES, QaError } from '@qa-ai-stlc/core';
import type { TestingScopeDecision } from '@qa-ai-stlc/schemas';
import type { CliIO } from './cli-io.js';
import { createCommandContext, type CreateCommandContextOptions } from './command-context.js';
import { runApprove, type ApproveResult } from './commands/approve.js';
import {
  runConfigAddEnvironment,
  runConfigAddIdentity,
  type ConfigAddEnvironmentResult,
  type ConfigAddIdentityResult,
} from './commands/config-add.js';
import { runConfigSet, type ConfigSetResult } from './commands/config-set.js';
import { runDoctor, type DoctorReport } from './commands/doctor.js';
import { runExplore, type ExploreReport } from './commands/explore.js';
import { runInit, type InitResult, type TestingScopeAnswers } from './commands/init.js';
import { runScope, type ScopeResult } from './commands/scope.js';
import { runValidate, type ValidateReport } from './commands/validate.js';
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
  config set    Change one testing.<type> scope decision after init
  config add    Add an environment or identity: "config add environment <name> ..." or "config add identity <name> ..."
  scope         Extract requirements into the scope artifact: "scope --from file --path <path>" or "scope --from text --content <text> --label <label>"
  approve       Approve a pipeline gate: "approve <gate> --artifact <path> --approved-by <name>"
  validate      Recompute every gate's status; nonzero exit if an approved artifact changed since

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
    switch (command) {
      case 'init':
        return await dispatchInit(rest, dependencies);
      case 'doctor':
        return await dispatchDoctor(rest, dependencies);
      case 'explore':
        return await dispatchExplore(rest, dependencies);
      case 'config':
        return await dispatchConfig(rest, dependencies);
      case 'scope':
        return await dispatchScope(rest, dependencies);
      case 'approve':
        return await dispatchApprove(rest, dependencies);
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
  });
  const json = values.json === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
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
  dependencies.io.stderr(`Unknown "qa config" subcommand "${subcommand ?? ''}".\n\n${USAGE}`);
  return EXIT_USAGE;
}

async function dispatchConfigSet(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const { values, positionals } = parseArgs({
    args: rest,
    options: { json: { type: 'boolean', default: false } },
    allowPositionals: true,
    strict: true,
  });
  const [key, value] = positionals;
  if (key === undefined || value === undefined) {
    throw new QaError('CONFIG_SET_USAGE', 'Usage: qa config set <key> <value>', {
      remediation: 'Example: qa config set testing.api in-scope',
    });
  }
  const json = values.json;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const result = await runConfigSet(context, { key, value });
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
      force: { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: true,
  });
  const [name] = positionals;
  if (name === undefined || typeof values['base-url'] !== 'string' || typeof values.allowlist !== 'string') {
    throw new QaError(
      'CONFIG_ADD_USAGE',
      'Usage: qa config add environment <name> --base-url <url> --allowlist <a,b,c>',
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
    force: values.force,
  });
  printResult(context.io, json, 'config-add-environment', result, formatConfigAddEnvironmentResult(result));
  return EXIT_SUCCESS;
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
    verify: values.verify === true,
  });
  printResult(context.io, json, 'explore', report, formatExploreReport(report));
  return report.degraded.length > 0 ? EXIT_FAILURE : EXIT_SUCCESS;
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

async function dispatchValidate(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const values = parseCommandArgs(rest, { json: { type: 'boolean', default: false } });
  const json = values.json === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const report = await runValidate(context);
  printResult(context.io, json, 'validate', report, formatValidateReport(report));
  return report.reopened.length > 0 ? EXIT_FAILURE : EXIT_SUCCESS;
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

function formatConfigAddIdentityResult(result: ConfigAddIdentityResult): readonly string[] {
  return [`Added identity "${result.name}": auth=${result.identity.auth}, secret=${result.identity.secret}`];
}

function formatDoctorReport(report: DoctorReport): readonly string[] {
  return report.checks.map((check) => {
    const marker = check.status === 'pass' ? 'PASS' : 'FAIL';
    const remediation = check.remediation !== undefined ? ` — ${check.remediation}` : '';
    return `[${marker}] ${check.name}: ${check.message}${remediation}`;
  });
}

function formatExploreReport(report: ExploreReport): readonly string[] {
  if (report.mode === 'verify') {
    const lines = [`Verified ${report.registryPath}: ${String(report.elementCount)} element(s) checked.`];
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
    `${String(report.missingLocatorCount)} element(s) with no locator candidate.`,
    `${String(report.blockedRequestCount)} non-GET request(s) blocked by safe mode.`,
  ];
}

function formatScopeResult(result: ScopeResult): readonly string[] {
  return [
    `Wrote ${result.scopePath}: ${String(result.total)} requirement(s) (${String(result.added)} added, ${String(result.updated)} updated).`,
  ];
}

function formatApproveResult(result: ApproveResult): readonly string[] {
  return [
    `Approved "${result.gate}": ${result.state.gates[result.gate].status}.`,
    `Current phase: ${result.state.currentPhase}.`,
  ];
}

function formatValidateReport(report: ValidateReport): readonly string[] {
  const lines = PHASES.map((phase) => {
    const status = report.state.gates[phase].status;
    const reopened = report.reopened.includes(phase) ? ' (reopened since last approval)' : '';
    return `[${status}] ${phase}${reopened}`;
  });
  lines.push(`Current phase: ${report.state.currentPhase}.`);
  return lines;
}
