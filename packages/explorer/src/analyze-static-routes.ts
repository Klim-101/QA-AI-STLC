// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { DiscoveredRoute, RouteMap } from '@qa-ai-stlc/schemas';
import { lineNumberAt, literalAttribute, type StaticSourceFile } from './analyze-static-source.js';
import { normalizeUrl } from './allowlist.js';

export interface StaticRouteFinding {
  readonly path: string;
  readonly filePath: string;
  readonly line: number;
}

export interface AnalyzeStaticRoutesOptions {
  readonly files: readonly StaticSourceFile[];
}

export interface AnalyzeStaticRoutesResult {
  readonly routes: readonly StaticRouteFinding[];
}

// React Router's own JSX form: `<Route path="/tasks/:id" ...>`. A nested `<Route>` inside a
// layout route's children is still matched, since this scans the whole file rather than one tree.
const REACT_ROUTE_TAG = /<Route\b([^>]*)>/g;

// Vue Router's `createRouter({ routes: [...] })` and Angular's `const routes: Routes = [...]`
// (development plan 6.1.2's route-config shape) declare a route array under the identifier
// "routes", as either an object property or a variable, with or without a type annotation between
// the name and the array. `[`/`]` are deliberately excluded from the optional type-annotation
// class so it can never swallow the array's own opening bracket.
const ROUTES_ARRAY_DECLARATION = /\broutes\s*(?::\s*[\w.<>]+\s*)?[:=]\s*\[/g;

// A literal `path` value inside a route-config object. Matches nested routes (a `children` array)
// too, since they sit inside the same outer `[...]` span this pattern is applied against.
const PATH_PROPERTY = /\bpath\s*:\s*(['"])([^'"]*)\1/g;

function findMatchingBracket(content: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < content.length; i += 1) {
    if (content[i] === '[') {
      depth += 1;
    } else if (content[i] === ']') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return content.length - 1;
}

function findReactRouterRoutes(file: StaticSourceFile): StaticRouteFinding[] {
  const findings: StaticRouteFinding[] = [];
  for (const match of file.content.matchAll(REACT_ROUTE_TAG)) {
    // The capturing group is not inside an alternation, so it always participates once the
    // pattern matches at all; the cast documents that instead of a defensive, untestable branch.
    // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
    const attrs = match[1] as string;
    const path = literalAttribute(attrs, 'path');
    if (path === undefined) {
      continue;
    }
    findings.push({ path, filePath: file.filePath, line: lineNumberAt(file.content, match.index) });
  }
  return findings;
}

// A route-config array can be declared more than once in a file (a parent `routes` and a nested
// `children: [...]`, which the outer array already covers); `coveredUntil` stops a later
// declaration match that starts inside an already-scanned span from being scanned twice.
function findConfigObjectRoutes(file: StaticSourceFile): StaticRouteFinding[] {
  const findings: StaticRouteFinding[] = [];
  let coveredUntil = -1;
  for (const declaration of file.content.matchAll(ROUTES_ARRAY_DECLARATION)) {
    const openIndex = declaration.index + declaration[0].length - 1;
    if (openIndex <= coveredUntil) {
      continue;
    }
    const closeIndex = findMatchingBracket(file.content, openIndex);
    coveredUntil = closeIndex;

    const span = file.content.slice(openIndex, closeIndex + 1);
    for (const pathMatch of span.matchAll(PATH_PROPERTY)) {
      // Group 2 always participates when PATH_PROPERTY matches at all (it is not inside an
      // alternation); the cast documents that instead of a defensive, untestable branch.
      // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
      const path = pathMatch[2] as string;
      const absoluteIndex = openIndex + pathMatch.index;
      findings.push({ path, filePath: file.filePath, line: lineNumberAt(file.content, absoluteIndex) });
    }
  }
  return findings;
}

/**
 * Extracts client-side route declarations — React Router's `<Route path="...">` JSX, and Vue
 * Router's/Angular's `path: '...'` route-config objects under a `routes` array — from raw source
 * text (development plan 6.1.2), the same lightweight lexical scan `analyzeStaticSource` uses
 * rather than a per-framework AST parser (`@babel/parser`, `vue/compiler-sfc`, `@angular/compiler`).
 * Seeds routes the crawler cannot discover by following links alone: a route reachable only by a
 * programmatic `navigate()` call, or one behind a condition the crawler never satisfies.
 */
export function analyzeStaticRoutes(options: AnalyzeStaticRoutesOptions): AnalyzeStaticRoutesResult {
  const routes = options.files.flatMap((file) => [
    ...findReactRouterRoutes(file),
    ...findConfigObjectRoutes(file),
  ]);
  return { routes };
}

/**
 * Merges statically-extracted routes into a crawler-produced `RouteMap` (development plan 6.1.2's
 * "merge does not duplicate routes the crawler already found"): each finding's path is resolved
 * against the route map's own `startUrl` origin and normalized the same way the crawler's own
 * routes are, so a route both sides found lands on the identical URL and is added only once. A
 * static route's `sourceLocation` is the only place a developer can be pointed at for it — there
 * is no live navigation, unlike a `link`/`sitemap` route.
 */
export function mergeStaticRoutes(routeMap: RouteMap, staticRoutes: readonly StaticRouteFinding[]): RouteMap {
  const origin = new URL(routeMap.startUrl).origin;
  const knownUrls = new Set(routeMap.routes.map((route) => normalizeUrl(route.url)));

  const added: DiscoveredRoute[] = [];
  for (const finding of staticRoutes) {
    const url = normalizeUrl(new URL(finding.path, origin).toString());
    if (knownUrls.has(url)) {
      continue;
    }
    knownUrls.add(url);
    added.push({
      url,
      discoveredVia: 'static',
      sourceLocation: { filePath: finding.filePath, line: finding.line },
    });
  }

  return { ...routeMap, routes: [...routeMap.routes, ...added] };
}
