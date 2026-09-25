// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// AGENTS.md §9.3: the licenses a runtime dependency may carry without further sign-off.
export const ALLOWED_LICENSES = [
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'CC0-1.0',
  'Unlicense',
  'BlueOak-1.0.0',
  'Python-2.0',
];

// AGENTS.md §9.3 also lists licenses that ship only with explicit, per-dependency maintainer
// approval (MPL-2.0, EPL-2.0, CC-BY-4.0 for content) rather than a blanket allow — each entry here
// is one approved exception, pinned to the exact version approved, with the NOTICE entry its
// license requires. A dependency upgrade past this version needs a fresh approval, not a silent
// pass, so it is deliberately not matched by license or by name alone.
const APPROVED_LICENSE_EXCEPTIONS = new Set([
  // axe-core (MPL-2.0), approved for P3-14 (#153): NOTICE documents it as an unmodified runtime
  // dependency, its license terms applying to its own source.
  'axe-core@4.13.0',
]);

/**
 * Recursively collects every non-workspace `name@version` pair out of an `npm ls --json` tree
 * (its `dependencies` object, possibly nested under `dependencies.dependencies...`). Skips
 * `@qa-ai-stlc/*` entries: this project's own packages, never subject to a third-party allowlist.
 */
export function collectProductionDependencies(dependencies) {
  const found = new Map();
  walk(dependencies);
  return found;

  function walk(node) {
    if (node === undefined) {
      return;
    }
    for (const [name, info] of Object.entries(node)) {
      if (!name.startsWith('@qa-ai-stlc/') && typeof info.version === 'string') {
        found.set(`${name}@${info.version}`, { name, version: info.version });
      }
      walk(info.dependencies);
    }
  }
}

/**
 * Whether a license-checker license expression (`"MIT"`, `"(MIT OR Apache-2.0)"`) satisfies
 * `allowedLicenses`: an OR-expression is satisfied by any one of its alternatives, matching how a
 * dual-licensed package lets the consumer pick the license it complies with.
 */
export function isLicenseAllowed(licenseExpression, allowedLicenses = ALLOWED_LICENSES) {
  if (typeof licenseExpression !== 'string') {
    return false;
  }
  const alternatives = licenseExpression.replace(/[()]/g, '').split(/\s+OR\s+/i);
  return alternatives.some((license) => allowedLicenses.includes(license.trim()));
}

/**
 * Cross-references every production dependency against a `license-checker-rseidelsohn --json`
 * report and `allowedLicenses`. An empty result means every production dependency is compliant
 * (AGENTS.md §9.3); a dependency absent from the report is itself a violation, not silently
 * skipped — the report is expected to cover the exact same install this dependency list came from.
 */
export function findLicenseViolations(
  dependencyVersions,
  licenseReport,
  allowedLicenses = ALLOWED_LICENSES,
  approvedExceptions = APPROVED_LICENSE_EXCEPTIONS,
) {
  const violations = [];
  for (const key of dependencyVersions.keys()) {
    if (approvedExceptions.has(key)) {
      continue;
    }
    const entry = licenseReport[key];
    if (entry === undefined) {
      violations.push({ dependency: key, reason: 'not found in the license report' });
      continue;
    }
    if (!isLicenseAllowed(entry.licenses, allowedLicenses)) {
      violations.push({ dependency: key, reason: `disallowed license "${String(entry.licenses)}"` });
    }
  }
  return violations.sort((a, b) => a.dependency.localeCompare(b.dependency));
}
