// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { findLoginRedirect, loginPathsOf } from './login-redirect.js';

const API = 'https://staging.example.test/api/tasks/1';

describe('findLoginRedirect', () => {
  it.each(['/login', '/log-in', '/signin', '/sign-in/', '/sso', '/auth/login', '/account/Login?next=%2Fx'])(
    'recognises %s as a sign-in page',
    (target) => {
      expect(findLoginRedirect(API, target, [])).toBeDefined();
    },
  );

  it('resolves a relative location against the request and reports the path reached', () => {
    expect(findLoginRedirect(API, '/login?next=/tasks/1', [])).toBe('/login');
    expect(findLoginRedirect(API, 'https://staging.example.test/signin', [])).toBe('/signin');
  });

  it('recognises the path of a configured identity login URL', () => {
    expect(findLoginRedirect(API, '/welcome/enter', ['/welcome/enter'])).toBe('/welcome/enter');
    expect(findLoginRedirect(API, '/welcome/enter', [])).toBeUndefined();
  });

  it('ignores a redirect elsewhere, no redirect, and a segment that only contains the word', () => {
    expect(findLoginRedirect(API, '/api/tasks/2', [])).toBeUndefined();
    expect(findLoginRedirect(API, undefined, [])).toBeUndefined();
    expect(findLoginRedirect(API, '/blogin/page', [])).toBeUndefined();
    expect(findLoginRedirect(API, '/loginfo', [])).toBeUndefined();
  });

  it('does not report a call that was aimed at the sign-in page itself, or that stayed where it was', () => {
    expect(findLoginRedirect('https://staging.example.test/login', '/login/step-2', [])).toBeUndefined();
    expect(findLoginRedirect('https://staging.example.test/login', '/login', [])).toBeUndefined();
  });

  it('does not throw on a location that is not a URL', () => {
    expect(findLoginRedirect(API, 'http://', [])).toBeUndefined();
    expect(findLoginRedirect('not a url', '/login', [])).toBeUndefined();
  });
});

describe('loginPathsOf', () => {
  it('reads the path of each identity login URL, absolute or relative, and skips identities without one', () => {
    expect(
      loginPathsOf(
        {
          admin: { loginUrl: 'https://staging.example.test/welcome/enter' },
          member: { loginUrl: '/members/enter' },
          anonymous: {},
          broken: { loginUrl: 'http://' },
        },
        'https://staging.example.test/',
      ),
    ).toEqual(['/welcome/enter', '/members/enter']);
  });
});
