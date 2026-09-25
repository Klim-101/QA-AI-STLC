// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { collectProductionDependencies, findLicenseViolations, isLicenseAllowed } from './license-policy.mjs';

describe('collectProductionDependencies', () => {
  it('collects a dependency and its transitive dependency, deduplicated by name@version', () => {
    const tree = {
      zod: { version: '4.6.5' },
      '@qa-ai-stlc/core': {
        version: '1.1.0',
        dependencies: {
          zod: { version: '4.6.5' },
          'axe-core': { version: '4.13.0' },
        },
      },
    };

    const result = collectProductionDependencies(tree);

    expect([...result.keys()].sort()).toEqual(['axe-core@4.13.0', 'zod@4.6.5']);
  });

  it("skips this project's own @qa-ai-stlc/* workspace packages", () => {
    const result = collectProductionDependencies({ '@qa-ai-stlc/schemas': { version: '1.0.1' } });

    expect(result.size).toBe(0);
  });

  it('returns an empty map for an undefined dependency tree', () => {
    expect(collectProductionDependencies(undefined).size).toBe(0);
  });
});

describe('isLicenseAllowed', () => {
  it('accepts a license on the allowlist', () => {
    expect(isLicenseAllowed('MIT')).toBe(true);
  });

  it('rejects a license not on the allowlist', () => {
    expect(isLicenseAllowed('GPL-3.0')).toBe(false);
  });

  it('accepts an OR-expression when one alternative is allowed', () => {
    expect(isLicenseAllowed('(GPL-3.0 OR MIT)')).toBe(true);
  });

  it('rejects a non-string license value', () => {
    expect(isLicenseAllowed(undefined)).toBe(false);
  });
});

describe('findLicenseViolations', () => {
  it('reports no violations when every dependency has an allowed license', () => {
    const dependencyVersions = collectProductionDependencies({ zod: { version: '4.6.5' } });
    const licenseReport = { 'zod@4.6.5': { licenses: 'MIT' } };

    expect(findLicenseViolations(dependencyVersions, licenseReport)).toEqual([]);
  });

  // The issue's own repro (#353): a workspace package depending on something with a disallowed
  // license must be caught, proving the check's effectiveness rather than assuming it.
  it('flags a dependency carrying a disallowed license', () => {
    const dependencyVersions = collectProductionDependencies({ 'left-pad': { version: '1.0.0' } });
    const licenseReport = { 'left-pad@1.0.0': { licenses: 'WTFPL' } };

    const violations = findLicenseViolations(dependencyVersions, licenseReport);

    expect(violations).toEqual([{ dependency: 'left-pad@1.0.0', reason: 'disallowed license "WTFPL"' }]);
  });

  it('flags a dependency missing from the license report', () => {
    const dependencyVersions = collectProductionDependencies({ ghost: { version: '1.0.0' } });

    const violations = findLicenseViolations(dependencyVersions, {});

    expect(violations).toEqual([{ dependency: 'ghost@1.0.0', reason: 'not found in the license report' }]);
  });

  it('does not flag a dependency covered by an approved exception, even with a disallowed license', () => {
    const dependencyVersions = collectProductionDependencies({ 'axe-core': { version: '4.13.0' } });
    const licenseReport = { 'axe-core@4.13.0': { licenses: 'MPL-2.0' } };

    const violations = findLicenseViolations(
      dependencyVersions,
      licenseReport,
      undefined,
      new Set(['axe-core@4.13.0']),
    );

    expect(violations).toEqual([]);
  });

  it('sorts violations by dependency name', () => {
    const dependencyVersions = collectProductionDependencies({
      zeta: { version: '1.0.0' },
      alpha: { version: '1.0.0' },
    });
    const licenseReport = {
      'zeta@1.0.0': { licenses: 'GPL-3.0' },
      'alpha@1.0.0': { licenses: 'GPL-3.0' },
    };

    const violations = findLicenseViolations(dependencyVersions, licenseReport);

    expect(violations.map((violation) => violation.dependency)).toEqual(['alpha@1.0.0', 'zeta@1.0.0']);
  });
});
