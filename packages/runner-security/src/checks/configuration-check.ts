// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { SecurityConfidence, SecurityFinding } from '@qa-ai-stlc/schemas';
import { buildFinding } from '../finding.js';
import type { SecurityCheck, SecurityCheckOutcome } from '../security-check.js';
import { MAX_CITED_LINES_PER_FILE, isTestOrFixturePath, scannableLines } from './code-check-support.js';

interface ConfigurationRule {
  readonly name: string;
  readonly title: string;
  readonly riskArea: string;
  readonly regex: RegExp;
  readonly severity: SecurityFinding['severityProposal'];
  readonly confidence: SecurityConfidence;
  readonly remediation: string;
}

// A debug or test-only route, by the names such routes usually carry. The route prefix is anchored
// to the start of the path so `/debuggable-things` is not mistaken for `/debug`.
const DEBUG_ROUTE =
  /(?:\.(?:get|post|put|patch|delete|all|use)\(|@\w+\.(?:route|get|post)\()\s*["'`]\/(?:_{0,2}(?:debug|test|testing|reset|seed|phpinfo|console)|test-only|internal\/test|heapdump)(?:[/"'`?]|$)/iu;

const RULES: readonly ConfigurationRule[] = [
  {
    name: 'debug-endpoint',
    title: 'A debug or test-only endpoint is registered',
    riskArea: 'Debug and test-only code in production builds',
    regex: DEBUG_ROUTE,
    severity: 'major',
    confidence: 'medium',
    remediation:
      'Register debug and test-only routes only when the environment is not production, or remove them.',
  },
  {
    name: 'cookie-http-only-disabled',
    title: 'Cookies are configured without HttpOnly',
    riskArea: 'Session management configuration',
    regex: /\bhttpOnly["']?\s*[:=]\s*false\b/iu,
    severity: 'major',
    confidence: 'high',
    remediation: 'Leave HttpOnly on for session cookies so a script injected into a page cannot read them.',
  },
  {
    name: 'cookie-secure-disabled',
    title: 'Cookies are configured without Secure',
    riskArea: 'Session management configuration',
    regex: /\bsecure["']?\s*[:=]\s*false\b/iu,
    severity: 'major',
    confidence: 'medium',
    remediation: 'Set Secure on session cookies so they are never sent over plain HTTP.',
  },
  {
    name: 'debug-mode-enabled',
    title: 'Debug mode is switched on in configuration',
    riskArea: 'Debug and test-only code in production builds',
    regex: /\bdebug["']?\s*[:=]\s*(?:true|True)\b|\bDEBUG\s*=\s*True\b|\.run\([^)]*\bdebug\s*=\s*True/u,
    severity: 'minor',
    confidence: 'low',
    remediation: 'Switch debug mode off in production configuration, or derive it from the environment.',
  },
  {
    name: 'tls-verification-disabled',
    title: 'Certificate verification is switched off',
    riskArea: 'Transport security configuration',
    regex:
      /\brejectUnauthorized["']?\s*[:=]\s*false\b|NODE_TLS_REJECT_UNAUTHORIZED["']?\s*[:=]\s*["']?0\b|\bverify\s*=\s*False\b/u,
    severity: 'major',
    confidence: 'medium',
    remediation: 'Keep certificate verification on; trust a private authority explicitly instead.',
  },
  {
    name: 'cors-any-origin',
    title: 'Any origin is allowed by the CORS configuration',
    riskArea: 'Cross-origin access configuration',
    regex: /\borigin["']?\s*:\s*["'`]\*["'`]|Access-Control-Allow-Origin["']?\s*[:,=]\s*["'`]\*["'`]/iu,
    severity: 'minor',
    confidence: 'medium',
    remediation: 'Allow the origins that need access by name, and never combine a wildcard with credentials.',
  },
];

const CONFIGURATION_EXTENSIONS =
  /\.(?:[cm]?[jt]sx?|py|rb|php|java|kt|cs|go|json|ya?ml|toml|ini|env|properties|config|xml)$/iu;

// A setting wrapped in an environment test (`if (process.env.NODE_ENV !== 'production')`) is the
// intended way to keep development behavior out of a production build. The words are looked for in
// the same line and the few above it; a deeper nesting is a limitation, so those findings keep their
// stated confidence and the remediation says to guard the setting.
const ENVIRONMENT_GUARD = /NODE_ENV|APP_ENV|\bisProd|\bisDev|\bis_prod|\bis_dev|FLASK_ENV|RAILS_ENV/u;
const GUARD_WINDOW_LINES = 6;

/**
 * Looks in the source checkout for settings and routes that should not reach a production build:
 * debug and test-only endpoints, debug mode, cookies without HttpOnly or Secure, disabled
 * certificate verification, a wildcard CORS origin. Test code is not examined. These are patterns
 * in text, not an analysis of what runs, so a clean result is `uncertain` and a match keeps a
 * confidence that says how often the pattern is wrong.
 */
export const configurationCheck: SecurityCheck = {
  checkClass: 'configuration',
  run: async ({ source }): Promise<SecurityCheckOutcome> => {
    if (source === undefined) {
      return { status: 'skipped', note: 'No source.path is configured.', findings: [] };
    }
    const scan = await source.scan();
    const findings: SecurityFinding[] = [];
    let examinedCount = 0;
    for (const file of scan.files) {
      if (isTestOrFixturePath(file.path) || !CONFIGURATION_EXTENSIONS.test(file.path)) {
        continue;
      }
      examinedCount += 1;
      const lines = scannableLines(file.text);
      const allLines = file.text.split(/\r?\n/u);
      for (const rule of RULES) {
        const matched = lines.filter(
          (line) =>
            rule.regex.test(line.text) &&
            !allLines
              .slice(Math.max(0, line.number - 1 - GUARD_WINDOW_LINES), line.number)
              .some((candidate) => ENVIRONMENT_GUARD.test(candidate)),
        );
        if (matched.length === 0) {
          continue;
        }
        findings.push(
          buildFinding({
            idParts: ['configuration', rule.name, file.path],
            checkClass: 'configuration',
            riskArea: rule.riskArea,
            confidence: rule.confidence,
            severityProposal: rule.severity,
            title: `${rule.title} in ${file.path}`,
            steps: [`Open ${file.path}`, `Read line ${String(matched[0]?.number)}`],
            expectedResult: 'Production builds carry no debug or test-only behavior and use safe defaults',
            actualResult: `${file.path} contains this setting on ${String(matched.length)} line(s) with no environment check beside it`,
            remediation: rule.remediation,
            regressionCheck: `Assert that ${file.path} no longer matches this setting, or that it is guarded by an environment check`,
            requestIndexes: [],
            codeReferences: matched
              .slice(0, MAX_CITED_LINES_PER_FILE)
              .map((line) => ({ path: file.path, line: line.number })),
          }),
        );
      }
    }
    return {
      status: 'uncertain',
      note: `Matched ${String(RULES.length)} patterns in ${String(examinedCount)} configuration or code file(s). Patterns in text do not show what a production build runs.${scan.isTruncated ? ' The file limit stopped the scan early.' : ''}`,
      findings,
    };
  },
};
