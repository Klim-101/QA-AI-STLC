// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { dirname, relative, sep } from 'node:path';

function commonSegmentPrefix(a: readonly string[], b: readonly string[]): string[] {
  const prefix: string[] = [];
  for (let index = 0; index < a.length && index < b.length; index += 1) {
    const segment = a[index];
    if (segment === undefined || segment !== b[index]) {
      break;
    }
    prefix.push(segment);
  }
  return prefix;
}

/**
 * The deepest directory that contains every given absolute path. Used as Playwright's `testDir`
 * so `testMatch` can list each spec by its exact path relative to it — precise, unlike Playwright
 * CLI's own positional-argument filter, which matches by substring and does not anchor to a
 * single file (proven while building this runner: a bare filename argument silently matched
 * files of the same name in unrelated directories).
 */
export function computeCommonDirectory(absolutePaths: readonly string[]): string {
  const [first, ...rest] = absolutePaths.map((absolutePath) => dirname(absolutePath).split(sep));
  if (first === undefined) {
    throw new Error('computeCommonDirectory requires at least one path.');
  }
  const common = rest.reduce((prefix, segments) => commonSegmentPrefix(prefix, segments), first);
  return common.join(sep);
}

/** Playwright's `testMatch` compares relative-to-`testDir` paths with forward slashes, on every OS. */
function toPosixRelativePath(testDir: string, absolutePath: string): string {
  return relative(testDir, absolutePath).split(sep).join('/');
}

export interface SpecConfigOptions {
  readonly baseUrl: string;
  readonly specFiles: readonly string[];
  readonly reportPath: string;
  readonly outputDir: string;
}

/**
 * Builds an ephemeral Playwright config as plain-object ESM source, deliberately with no
 * `import` of `@playwright/test`: the config is written outside any project's `node_modules`, so
 * an import would fail to resolve. Hand-written spec files still import `@playwright/test`
 * themselves and resolve it from their own project, same as any other Playwright test.
 *
 * `outputDir` is set explicitly, not left to Playwright's own default (`<testDir>/test-results`,
 * which for a spec set spanning an operator's whole project would resolve inside it): every
 * artifact this run produces belongs in the same ephemeral run directory as the config and the
 * report, so a run never leaves stray files behind in the project it tested.
 */
export function generateSpecConfigSource(options: SpecConfigOptions): {
  readonly source: string;
  readonly testDir: string;
} {
  const testDir = computeCommonDirectory(options.specFiles);
  const testMatch = options.specFiles.map((specFile) => toPosixRelativePath(testDir, specFile));
  const config = {
    testDir,
    testMatch,
    outputDir: options.outputDir,
    use: { baseURL: options.baseUrl },
    reporter: [['json', { outputFile: options.reportPath }]],
  };
  return { source: `export default ${JSON.stringify(config, null, 2)};\n`, testDir };
}
