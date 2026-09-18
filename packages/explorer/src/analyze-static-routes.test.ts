// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { SCHEMA_VERSION, type RouteMap } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { analyzeStaticRoutes, mergeStaticRoutes } from './analyze-static-routes.js';
import type { StaticSourceFile } from './analyze-static-source.js';

function file(filePath: string, content: string): StaticSourceFile {
  return { filePath, content };
}

describe('analyzeStaticRoutes', () => {
  it('extracts a React Router route declared as JSX', () => {
    const { routes } = analyzeStaticRoutes({
      files: [file('src/App.tsx', '<Route path="/tasks" element={<TasksPage />} />')],
    });

    expect(routes).toEqual([{ path: '/tasks', filePath: 'src/App.tsx', line: 1 }]);
  });

  it('extracts every React Router route in a nested tree, with correct line numbers', () => {
    const content = [
      '<Routes>',
      '  <Route path="/dashboard" element={<Dashboard />}>',
      '    <Route path="/dashboard/tasks" element={<Tasks />} />',
      '  </Route>',
      '</Routes>',
    ].join('\n');

    const { routes } = analyzeStaticRoutes({ files: [file('src/App.tsx', content)] });

    expect(routes).toEqual([
      { path: '/dashboard', filePath: 'src/App.tsx', line: 2 },
      { path: '/dashboard/tasks', filePath: 'src/App.tsx', line: 3 },
    ]);
  });

  it('skips a Route tag with no literal path attribute (e.g. an index route)', () => {
    const { routes } = analyzeStaticRoutes({
      files: [file('src/App.tsx', '<Route index element={<Home />} />')],
    });

    expect(routes).toEqual([]);
  });

  it('does not capture a bound, non-literal path (Vue :path or Angular [path])', () => {
    const { routes } = analyzeStaticRoutes({
      files: [file('src/App.tsx', '<Route :path="dynamicPath" />')],
    });

    expect(routes).toEqual([]);
  });

  it('extracts Vue Router routes declared as a plain object array', () => {
    const content = [
      'const routes = [',
      "  { path: '/login', component: Login },",
      "  { path: '/tasks', component: Tasks },",
      '];',
      'export default createRouter({ history: createWebHistory(), routes });',
    ].join('\n');

    const { routes } = analyzeStaticRoutes({ files: [file('src/router.js', content)] });

    expect(routes).toEqual([
      { path: '/login', filePath: 'src/router.js', line: 2 },
      { path: '/tasks', filePath: 'src/router.js', line: 3 },
    ]);
  });

  it('extracts Vue Router routes declared inline in createRouter({ routes: [...] })', () => {
    const content = "createRouter({ routes: [{ path: '/login', component: Login }] });";

    const { routes } = analyzeStaticRoutes({ files: [file('src/router.js', content)] });

    expect(routes).toEqual([{ path: '/login', filePath: 'src/router.js', line: 1 }]);
  });

  it('extracts Angular routes declared with a Routes type annotation, including nested children', () => {
    const content = [
      'const routes: Routes = [',
      "  { path: 'tasks', component: TasksComponent, children: [",
      "    { path: ':id', component: TaskDetailComponent },",
      '  ] },',
      '];',
    ].join('\n');

    const { routes } = analyzeStaticRoutes({ files: [file('src/app.routes.ts', content)] });

    expect(routes).toEqual([
      { path: 'tasks', filePath: 'src/app.routes.ts', line: 2 },
      { path: ':id', filePath: 'src/app.routes.ts', line: 3 },
    ]);
  });

  it('does not scan the same routes array twice when two declarations overlap', () => {
    // A pathological but possible shape: a nested object also happens to use the "routes" key.
    // The outer declaration's span already covers the inner one; it must not be double-counted.
    const content = "const routes = [{ path: '/a', routes: [{ path: '/b' }] }];";

    const { routes } = analyzeStaticRoutes({ files: [file('src/router.js', content)] });

    expect(routes).toEqual([
      { path: '/a', filePath: 'src/router.js', line: 1 },
      { path: '/b', filePath: 'src/router.js', line: 1 },
    ]);
  });

  it('does not hang or throw on a routes array with no closing bracket', () => {
    const content = "const routes = [{ path: '/a', component: A }";

    const { routes } = analyzeStaticRoutes({ files: [file('src/router.js', content)] });

    expect(routes).toEqual([{ path: '/a', filePath: 'src/router.js', line: 1 }]);
  });

  it('finds routes across multiple files and both frameworks in one call', () => {
    const { routes } = analyzeStaticRoutes({
      files: [
        file('src/App.tsx', '<Route path="/tasks" />'),
        file('src/router.js', "const routes = [{ path: '/login' }];"),
      ],
    });

    expect(routes.map((route) => route.path).sort()).toEqual(['/login', '/tasks']);
  });
});

function routeMap(startUrl: string, routes: RouteMap['routes'] = []): RouteMap {
  return { schemaVersion: SCHEMA_VERSION, generatedAt: '2026-09-18T00:00:00Z', startUrl, routes };
}

describe('mergeStaticRoutes', () => {
  it('adds a static route resolved against the route map origin', () => {
    const merged = mergeStaticRoutes(routeMap('https://example.com/dashboard'), [
      { path: '/tasks/new', filePath: 'src/App.tsx', line: 4 },
    ]);

    expect(merged.routes).toEqual([
      {
        url: 'https://example.com/tasks/new',
        discoveredVia: 'static',
        sourceLocation: { filePath: 'src/App.tsx', line: 4 },
      },
    ]);
  });

  it('does not duplicate a route the crawler already found', () => {
    const existing = routeMap('https://example.com/dashboard', [
      { url: 'https://example.com/tasks/new', discoveredVia: 'link' },
    ]);

    const merged = mergeStaticRoutes(existing, [{ path: '/tasks/new', filePath: 'src/App.tsx', line: 4 }]);

    expect(merged.routes).toEqual(existing.routes);
  });

  it('does not duplicate the same static finding across two files', () => {
    const merged = mergeStaticRoutes(routeMap('https://example.com/dashboard'), [
      { path: '/tasks/new', filePath: 'src/App.tsx', line: 4 },
      { path: '/tasks/new', filePath: 'src/router.js', line: 9 },
    ]);

    expect(merged.routes).toHaveLength(1);
  });

  it('keeps every pre-existing route untouched', () => {
    const existing = routeMap('https://example.com/dashboard', [
      { url: 'https://example.com/dashboard', discoveredVia: 'link' },
    ]);

    const merged = mergeStaticRoutes(existing, [{ path: '/tasks', filePath: 'src/App.tsx', line: 1 }]);

    expect(merged.routes[0]).toEqual(existing.routes[0]);
    expect(merged.routes).toHaveLength(2);
  });
});
