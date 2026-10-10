// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { FetchedPage } from '../fetch-page.js';
import type { IdentitySession } from '../identity-sessions.js';

// A page that asks the visitor to sign in. Applications name it differently, so this is a broad
// reading of the path, used only to tell "the application let me in" from "it sent me to sign in".
const SIGN_IN_PATH = /login|signin|sign-in|sso|auth/iu;

/** The request headers that replay a signed-in session; they carry a credential and are never logged. */
export function sessionHeaders(session: IdentitySession): Readonly<Record<string, string>> {
  return { cookie: session.cookieHeader };
}

function pathnameOf(path: string): string {
  return new URL(path, 'http://placeholder.invalid').pathname;
}

/** Whether `page` is a real page of the application rather than a failure or a sign-in page. */
export function isAccepted(page: FetchedPage): boolean {
  return (
    page.response.status >= 200 && page.response.status < 300 && !SIGN_IN_PATH.test(pathnameOf(page.path))
  );
}

/** Whether `page` is the page that was asked for, after any same-origin redirects. */
export function reachedRoute(page: FetchedPage, route: string): boolean {
  return isAccepted(page) && pathnameOf(page.path) === pathnameOf(route);
}

/** Whether a redirect location leads to a sign-in page. */
export function isSignInLocation(location: string | undefined): boolean {
  return location !== undefined && SIGN_IN_PATH.test(pathnameOf(location));
}
