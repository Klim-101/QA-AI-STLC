// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { fetchPage } from './fetch-page.js';
import { scriptedProbe, type ScriptedResponse } from './test-support/scripted-probe.js';

const BASE_URL = 'http://app.example.test/';

function serving(routes: Readonly<Record<string, ScriptedResponse>>) {
  return scriptedProbe((request) => routes[request.path] ?? { status: 404 });
}

describe('fetchPage', () => {
  it('returns a page that does not redirect as it is', async () => {
    const { probe } = serving({ '/': { bodyText: 'home' } });

    const page = await fetchPage(probe, BASE_URL, '/');

    expect(page.path).toBe('/');
    expect(page.response.bodyText).toBe('home');
    expect(page.chain).toHaveLength(1);
  });

  it.each([
    ['a relative path', '/dashboard'],
    ['an absolute URL on the same origin', 'http://app.example.test/dashboard'],
    ['a path relative to the current one', 'dashboard'],
  ])('follows a redirect given as %s', async (_label, location) => {
    const { probe } = serving({
      '/': { status: 302, headers: { location } },
      '/dashboard': { bodyText: 'dashboard' },
    });

    const page = await fetchPage(probe, BASE_URL, '/');

    expect(page.path).toBe('/dashboard');
    expect(page.response.bodyText).toBe('dashboard');
    expect(page.chain.map((response) => response.status)).toEqual([302, 200]);
  });

  it('keeps the query of the redirect target', async () => {
    const { probe, requests } = serving({
      '/': { status: 301, headers: { location: '/login?next=%2F' } },
      '/login?next=%2F': { bodyText: 'login' },
    });

    await fetchPage(probe, BASE_URL, '/');

    expect(requests.map((request) => request.path)).toEqual(['/', '/login?next=%2F']);
  });

  it('does not follow a redirect to another host: that response is the page', async () => {
    const { probe, requests } = serving({
      '/': { status: 302, headers: { location: 'https://elsewhere.example.test/x' } },
    });

    const page = await fetchPage(probe, BASE_URL, '/');

    expect(page.response.status).toBe(302);
    expect(requests).toHaveLength(1);
  });

  it('does not follow a redirect that has no Location', async () => {
    const { probe, requests } = serving({ '/': { status: 302 } });

    const page = await fetchPage(probe, BASE_URL, '/');

    expect(page.response.status).toBe(302);
    expect(requests).toHaveLength(1);
  });

  it('does not treat a Location on an ordinary response as a redirect', async () => {
    const { probe, requests } = serving({ '/': { status: 200, headers: { location: '/elsewhere' } } });

    await fetchPage(probe, BASE_URL, '/');

    expect(requests).toHaveLength(1);
  });

  it('stops after the maximum number of hops', async () => {
    const { probe, requests } = serving({
      '/a': { status: 302, headers: { location: '/b' } },
      '/b': { status: 302, headers: { location: '/c' } },
      '/c': { status: 302, headers: { location: '/d' } },
      '/d': { status: 302, headers: { location: '/e' } },
    });

    const page = await fetchPage(probe, BASE_URL, '/a');

    expect(page.path).toBe('/d');
    expect(requests).toHaveLength(4);
  });

  it('honours a smaller hop limit', async () => {
    const { probe, requests } = serving({
      '/a': { status: 302, headers: { location: '/b' } },
      '/b': { status: 302, headers: { location: '/c' } },
    });

    const page = await fetchPage(probe, BASE_URL, '/a', { maxHops: 1 });

    expect(page.path).toBe('/b');
    expect(requests).toHaveLength(2);
  });

  it('sends the same extra headers on every hop', async () => {
    const { probe, requests } = serving({
      '/': { status: 302, headers: { location: '/next' } },
      '/next': {},
    });

    await fetchPage(probe, BASE_URL, '/', { headers: { origin: 'https://x.example.test' } });

    expect(requests.map((request) => request.headers.origin)).toEqual([
      'https://x.example.test',
      'https://x.example.test',
    ]);
  });
});
