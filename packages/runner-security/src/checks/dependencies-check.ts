// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { posix } from 'node:path';
import { QaError } from '@qa-ai-stlc/core';
import type { SecurityFinding } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { buildFinding } from '../finding.js';
import type { SecurityCheck, SecurityCheckOutcome } from '../security-check.js';
import type { SourceCheckout } from '../source-checkout.js';

const NPM_AUDIT_TIMEOUT_MS = 120_000;
const LOCKFILE_NAMES = ['package-lock.json', 'npm-shrinkwrap.json'] as const;
const MAX_ADVISORIES_PER_FINDING = 3;
const MAX_ADVISORY_TITLE_LENGTH = 120;

const NpmSeveritySchema = z.enum(['info', 'low', 'moderate', 'high', 'critical']);
type NpmSeverity = z.infer<typeof NpmSeveritySchema>;

const NpmAuditReportSchema = z.union([
  z.object({ error: z.object({ code: z.string().optional(), summary: z.string().optional() }) }),
  z.object({
    vulnerabilities: z.record(
      z.string(),
      z.object({
        name: z.string(),
        severity: NpmSeveritySchema,
        isDirect: z.boolean().optional(),
        // An entry is an advisory object, or the name of another vulnerable package it passes through.
        via: z.array(z.union([z.string(), z.object({ title: z.string().optional() })])).default([]),
        fixAvailable: z.union([z.boolean(), z.object({ name: z.string(), version: z.string() })]).optional(),
      }),
    ),
  }),
]);
type NpmAuditReport = z.infer<typeof NpmAuditReportSchema>;
type FixAvailable = boolean | { readonly name: string; readonly version: string } | undefined;

const SEVERITY_BY_NPM_SEVERITY: Readonly<Record<NpmSeverity, SecurityFinding['severityProposal']>> = {
  critical: 'critical',
  high: 'major',
  moderate: 'minor',
  low: 'trivial',
  info: 'trivial',
};

/**
 * Asks npm which installed dependencies have known vulnerabilities (`npm audit`, read-only: it
 * never installs or changes a file). It sends package names and versions from the lockfile to the
 * configured package registry, which is why the class has to be named in the authorization. Only
 * npm projects with a lockfile are covered; any other layout is `skipped`, and an audit that could
 * not run or answered with an error is `blocked`, never `passed`.
 */
export const dependenciesCheck: SecurityCheck = {
  checkClass: 'dependencies',
  run: async ({ source }): Promise<SecurityCheckOutcome> => {
    if (source === undefined) {
      return { status: 'skipped', note: 'No source.path is configured.', findings: [] };
    }
    const located = await locateLockfile(source);
    if (located === undefined) {
      return {
        status: 'skipped',
        note: 'No package-lock.json was found at or above source.path. Only npm projects with a lockfile are audited in this version.',
        findings: [],
      };
    }
    const report = await runNpmAudit(source, located.directory);
    if ('error' in report) {
      throw new QaError(
        'SECURITY_DEPENDENCY_AUDIT_FAILED',
        `npm audit could not complete: ${report.error.summary ?? report.error.code ?? 'no reason given'}`,
        {
          remediation:
            'Check the registry is reachable and the lockfile is current, then run the audit again.',
        },
      );
    }
    const manifestPath = posix.join(source.relativeRoot, 'package.json');
    const manifestText = await source.readText(manifestPath);
    const findings = Object.values(report.vulnerabilities).map((vulnerability) => {
      const advisoryTitles = vulnerability.via
        .flatMap((entry) => (typeof entry === 'string' || entry.title === undefined ? [] : [entry.title]))
        .slice(0, MAX_ADVISORIES_PER_FINDING)
        .map((title) => title.replace(/\s+/gu, ' ').slice(0, MAX_ADVISORY_TITLE_LENGTH));
      const manifestLine =
        vulnerability.isDirect === true ? lineOfDependency(manifestText, vulnerability.name) : undefined;
      const directness =
        vulnerability.isDirect === true ? 'a direct dependency' : 'pulled in by another dependency';
      const advisories = advisoryTitles.length > 0 ? `: ${advisoryTitles.join('; ')}` : '';
      return buildFinding({
        idParts: ['dependencies', vulnerability.name],
        checkClass: 'dependencies',
        riskArea: 'Known vulnerabilities in third-party dependencies',
        confidence: 'high',
        severityProposal: SEVERITY_BY_NPM_SEVERITY[vulnerability.severity],
        title: `Dependency ${vulnerability.name} has a known ${vulnerability.severity} vulnerability`,
        steps: [
          `Run npm audit for ${source.relativeRoot === '' ? 'the project' : source.relativeRoot}`,
          `Read the entry for ${vulnerability.name}`,
        ],
        expectedResult: 'No dependency has a published vulnerability',
        actualResult: `${vulnerability.name} is reported as ${vulnerability.severity} (${directness})${advisories}`,
        remediation: remediationFor(vulnerability.name, vulnerability.fixAvailable),
        regressionCheck: `Run npm audit and assert it no longer reports ${vulnerability.name}`,
        requestIndexes: [],
        codeReferences: [
          manifestLine !== undefined
            ? { path: manifestPath, line: manifestLine }
            : { path: posix.join(located.directory, located.lockfile) },
        ],
      });
    });
    return {
      status: 'passed',
      note: 'Audited the lockfile against the package registry advisories.',
      findings,
    };
  },
};

async function locateLockfile(
  source: SourceCheckout,
): Promise<{ readonly directory: string; readonly lockfile: string } | undefined> {
  for (const lockfile of LOCKFILE_NAMES) {
    const directory = await source.findDirectoryWith(lockfile);
    if (directory !== undefined) {
      return { directory, lockfile };
    }
  }
  return undefined;
}

// A checkout inside a workspace shares the lockfile of the project above it, so the audit runs
// from the lockfile's directory and is narrowed to the checkout's own workspace.
async function runNpmAudit(source: SourceCheckout, lockDirectory: string): Promise<NpmAuditReport> {
  // The runner has no working directory of its own, so the project is named by absolute path.
  const args = ['audit', '--json', '--prefix', source.absoluteDirectory(lockDirectory)];
  if (lockDirectory !== source.relativeRoot) {
    args.push('--workspace', posix.relative(lockDirectory, source.relativeRoot));
  }
  let stdout: string;
  try {
    // npm exits non-zero when it finds vulnerabilities, so the exit code carries no meaning here;
    // the JSON report on stdout is the answer.
    ({ stdout } = await source.processRunner.run('npm', args, {
      signal: AbortSignal.timeout(NPM_AUDIT_TIMEOUT_MS),
    }));
  } catch (error) {
    throw new QaError('SECURITY_DEPENDENCY_AUDIT_FAILED', 'npm audit could not be started or timed out', {
      remediation: 'Check npm is installed and on the path.',
      cause: error,
    });
  }
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch (error) {
    throw new QaError('SECURITY_DEPENDENCY_AUDIT_FAILED', 'npm audit did not answer with JSON', {
      remediation: 'Run "npm audit --json" in the project to see what npm printed.',
      cause: error,
    });
  }
  const parsed = NpmAuditReportSchema.safeParse(json);
  if (!parsed.success) {
    throw new QaError(
      'SECURITY_DEPENDENCY_AUDIT_FAILED',
      'npm audit answered with a report in an unknown shape',
      {
        remediation: 'Update npm, or run "npm audit --json" in the project to see what it printed.',
      },
    );
  }
  return parsed.data;
}

function lineOfDependency(manifestText: string | undefined, name: string): number | undefined {
  const index = manifestText?.split(/\r?\n/u).findIndex((line) => line.trimStart().startsWith(`"${name}":`));
  return index === undefined || index < 0 ? undefined : index + 1;
}

function remediationFor(name: string, fixAvailable: FixAvailable): string {
  if (typeof fixAvailable === 'object') {
    return `Update ${fixAvailable.name} to ${fixAvailable.version} or later.`;
  }
  return fixAvailable === true
    ? `Update ${name} to a patched version (npm audit reports a fix is available).`
    : `No fix is published for ${name}: replace it, or limit how the application uses it.`;
}
