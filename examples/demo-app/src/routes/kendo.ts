// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import express, { Router } from 'express';

export const KENDO_PEOPLE_TOTAL = 117;
const MAX_TAKE = 100;

interface Person {
  readonly id: number;
  readonly name: string;
  readonly department: string;
}

const DEPARTMENTS = ['Support', 'Billing', 'Platform', 'Design'] as const;

const PEOPLE: readonly Person[] = Array.from({ length: KENDO_PEOPLE_TOTAL }, (_unused, index) => ({
  id: index + 1,
  name: `Person ${String(index + 1).padStart(3, '0')}`,
  department: DEPARTMENTS[index % DEPARTMENTS.length] ?? 'Support',
}));

function readNonNegativeInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function isPackageRoot(directory: string, packageName: string): boolean {
  const manifestPath = join(directory, 'package.json');
  return (
    existsSync(manifestPath) &&
    (JSON.parse(readFileSync(manifestPath, 'utf-8')) as { name?: string }).name === packageName
  );
}

/**
 * Resolves the directory of an installed package; the Kendo fixture needs the dev dependencies.
 * Found through the package's main entry, then upwards to its own manifest: a package's
 * `package.json` is not always exported (jQuery 4 does not export it), so it cannot be resolved
 * directly.
 */
function packageDirectory(packageName: string): string {
  const require = createRequire(import.meta.url);
  try {
    let directory = dirname(require.resolve(packageName));
    while (!isPackageRoot(directory, packageName)) {
      const parent = dirname(directory);
      if (parent === directory) {
        throw new Error(`No ${packageName} manifest above its main entry.`);
      }
      directory = parent;
    }
    return directory;
  } catch (cause) {
    throw new Error(
      `The Kendo fixture needs the demo app's dev dependencies; "${packageName}" is not installed.`,
      { cause },
    );
  }
}

/**
 * Serves the data the Kendo fixture pages page through, and the third-party assets they load. The
 * assets come from dev dependencies and are never copied into the repository or shipped.
 */
export function createKendoRouter(): Router {
  const router = Router();

  router.use('/vendor/jquery', express.static(join(packageDirectory('jquery'), 'dist')));
  router.use('/vendor/kendo', express.static(join(packageDirectory('kendo-ui-core'), 'umd')));
  router.use(
    '/vendor/kendo-theme',
    express.static(join(packageDirectory('@progress/kendo-theme-default'), 'dist')),
  );

  router.get('/api/kendo/people', (request, response) => {
    const skip = readNonNegativeInteger(request.query.skip, 0);
    const take = Math.min(readNonNegativeInteger(request.query.take, 10), MAX_TAKE);
    const end = Math.min(skip + take, KENDO_PEOPLE_TOTAL);
    // BUG-013: a page that runs past the end of the data loses its last row.
    const items = PEOPLE.slice(skip, end < skip + take ? end - 1 : end);
    response.json({ total: KENDO_PEOPLE_TOTAL, items });
  });

  return router;
}
