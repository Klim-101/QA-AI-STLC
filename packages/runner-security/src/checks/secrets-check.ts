// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { scanForSecrets } from '@qa-ai-stlc/core';
import type { SecurityConfidence, SecurityFinding } from '@qa-ai-stlc/schemas';
import { buildFinding } from '../finding.js';
import type { SecurityCheck, SecurityCheckOutcome } from '../security-check.js';
import { MAX_CITED_LINES_PER_FILE, isTestOrFixturePath, scannableLines } from './code-check-support.js';

interface LocalSecretPattern {
  readonly name: string;
  readonly regex: RegExp;
  /** Group holding the literal, when matching it alone would flag a harmless placeholder. */
  readonly literalGroup?: number;
}

// Shapes `scanForSecrets` does not cover. A hard-coded fallback such as `process.env.X ?? 'literal'`
// still ships the literal whenever the variable is unset, so it counts the same as a plain literal.
const LOCAL_SECRET_PATTERNS: readonly LocalSecretPattern[] = [
  { name: 'private-key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/u },
  {
    name: 'hardcoded-secret',
    regex: /\b\w*secret\w*["']?\s*[:=]\s*(?:[^'"\n]*(?:\?\?|\|\|)\s*)?["']([^"'\s]{8,})["']/iu,
    literalGroup: 1,
  },
];

// Names of environment variables (`QA_ADMIN_PASSWORD`) are how the project is told to hold a secret,
// not a secret.
const ENVIRONMENT_VARIABLE_NAME = /^[A-Z][A-Z0-9_]*$/u;

const PROVIDER_SHAPED: ReadonlySet<string> = new Set([
  'aws-access-key-id',
  'github-token',
  'slack-token',
  'private-key',
]);

interface Hit {
  readonly pattern: string;
  readonly line: number;
}

function findHits(lineText: string): Hit[] {
  const names = scanForSecrets(lineText).map(({ pattern }) => pattern);
  for (const { name, regex, literalGroup } of LOCAL_SECRET_PATTERNS) {
    const match = regex.exec(lineText);
    const literal = literalGroup === undefined ? undefined : match?.[literalGroup];
    if (match !== null && (literal === undefined || !ENVIRONMENT_VARIABLE_NAME.test(literal))) {
      names.push(name);
    }
  }
  return names.map((pattern) => ({ pattern, line: 0 }));
}

function confidenceFor(pattern: string, isTestPath: boolean): SecurityConfidence {
  if (isTestPath) {
    return 'low';
  }
  return PROVIDER_SHAPED.has(pattern) ? 'high' : 'medium';
}

function severityFor(pattern: string, isTestPath: boolean): SecurityFinding['severityProposal'] {
  if (isTestPath) {
    return 'minor';
  }
  return PROVIDER_SHAPED.has(pattern) ? 'critical' : 'major';
}

/**
 * Looks through the source checkout for credentials committed with the code. Only the kind of
 * secret and where it sits are reported, never the value, so the audit result and the defect draft
 * carry no credential themselves. A match in test code or sample data is reported with low
 * confidence. A clean result is `passed` only when every file was read: a truncated or partly
 * skipped scan cannot show that nothing is there.
 */
export const secretsCheck: SecurityCheck = {
  checkClass: 'secrets',
  run: async ({ source }): Promise<SecurityCheckOutcome> => {
    if (source === undefined) {
      return { status: 'skipped', note: 'No source.path is configured.', findings: [] };
    }
    const scan = await source.scan();
    const findings: SecurityFinding[] = [];
    for (const file of scan.files) {
      if (
        /(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|npm-shrinkwrap\.json)$/u.test(file.path)
      ) {
        continue;
      }
      const linesByPattern = new Map<string, number[]>();
      for (const line of scannableLines(file.text)) {
        for (const hit of findHits(line.text)) {
          linesByPattern.set(hit.pattern, [...(linesByPattern.get(hit.pattern) ?? []), line.number]);
        }
      }
      const isTestPath = isTestOrFixturePath(file.path);
      for (const [pattern, lines] of linesByPattern) {
        findings.push(
          buildFinding({
            idParts: ['secrets', pattern, file.path],
            checkClass: 'secrets',
            riskArea: 'Credential exposure in source',
            confidence: confidenceFor(pattern, isTestPath),
            severityProposal: severityFor(pattern, isTestPath),
            title: `A ${pattern.replaceAll('-', ' ')} is committed in ${file.path}`,
            steps: [`Open ${file.path}`, `Read line ${String(lines[0])}`],
            expectedResult:
              'Credentials are read from the environment or a secret manager and never committed with the code',
            actualResult: `${file.path} holds a ${pattern.replaceAll('-', ' ')} on ${String(lines.length)} line(s); the value is not repeated here`,
            remediation:
              'Remove the value from the code and its history, rotate it, and read it from an environment variable or a secret manager.',
            regressionCheck: `Run a secret scanner over the repository and assert it reports nothing in ${file.path}`,
            requestIndexes: [],
            codeReferences: lines
              .slice(0, MAX_CITED_LINES_PER_FILE)
              .map((lineNumber) => ({ path: file.path, line: lineNumber })),
          }),
        );
      }
    }
    return { ...outcomeFor(scan, findings.length), findings };
  },
};

function outcomeFor(
  scan: { readonly files: readonly unknown[]; readonly isTruncated: boolean; readonly skippedCount: number },
  findingCount: number,
): Pick<SecurityCheckOutcome, 'status' | 'note'> {
  const summary = `Read ${String(scan.files.length)} file(s) for known secret shapes.`;
  if (findingCount > 0) {
    return { status: 'passed', note: summary };
  }
  if (scan.files.length === 0) {
    return { status: 'uncertain', note: 'The source checkout has no readable text file.' };
  }
  if (scan.isTruncated || scan.skippedCount > 0) {
    return {
      status: 'uncertain',
      note: `${summary} ${scan.isTruncated ? 'The file limit stopped the scan early. ' : ''}${String(scan.skippedCount)} binary or oversized file(s) were not read.`,
    };
  }
  return { status: 'passed', note: summary };
}
