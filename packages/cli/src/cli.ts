// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { createRequire } from 'node:module';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { QaError } from '@qa-ai-stlc/core';
import type { CliIO } from './cli-io.js';
import { createCommandContext, type CreateCommandContextOptions } from './command-context.js';
import { runDoctor, type DoctorReport } from './commands/doctor.js';
import { runInit, type InitResult } from './commands/init.js';
import { EXIT_FAILURE, EXIT_SUCCESS, EXIT_USAGE } from './exit-codes.js';

export type RunCliDependencies = Omit<CreateCommandContextOptions, 'projectRoot' | 'json'> & {
  readonly io: CliIO;
  readonly projectRoot?: string;
};

const USAGE = `Usage: qa <command> [options]

Commands:
  init      Create the .qa/ store and a starting config.yaml
  doctor    Check Node, browsers, identities and environment reachability

Global options:
  --json         Print machine-readable JSON instead of human text
  -h, --help     Show this help
  --version      Show the CLI version`;

function readCliVersion(): string {
  const require = createRequire(import.meta.url);
  const packageJson = require('../package.json') as { readonly version: string };
  return packageJson.version;
}

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
    io.stdout(readCliVersion());
    return EXIT_SUCCESS;
  }

  try {
    switch (command) {
      case 'init':
        return await dispatchInit(rest, dependencies);
      case 'doctor':
        return await dispatchDoctor(rest, dependencies);
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

async function dispatchInit(rest: readonly string[], dependencies: RunCliDependencies): Promise<number> {
  const values = parseCommandArgs(rest, {
    json: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
  });
  const json = values.json === true;
  const context = createCommandContext({
    ...dependencies,
    projectRoot: dependencies.projectRoot ?? process.cwd(),
    json,
  });
  const result = await runInit(context, { force: values.force === true });
  printResult(context.io, json, 'init', result, formatInitResult(result));
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

function formatDoctorReport(report: DoctorReport): readonly string[] {
  return report.checks.map((check) => {
    const marker = check.status === 'pass' ? 'PASS' : 'FAIL';
    const remediation = check.remediation !== undefined ? ` — ${check.remediation}` : '';
    return `[${marker}] ${check.name}: ${check.message}${remediation}`;
  });
}
