# Session cookie lacks the Secure flag

**Id:** defect-session-cookie-flags
**Proposed severity:** major
**Category:** security
**Environment:** staging
**Requirements:** authentication, session
**Status:** draft

## Steps to reproduce

1. Open the login page
2. Enter an unregistered email and any password
3. Click the "Log in" button

## Expected result

The login page is redisplayed with an error message.

## Actual result

The login page is redisplayed with no message.

## Security assessment

**Risk area:** session management
**Confidence:** high
**Suggested remediation:** Set the Secure and HttpOnly attributes on the session cookie.
**Regression check:** Assert the Set-Cookie header of the login response carries Secure.

## Evidence

- `evidence/run-demo-1/screenshot-1.png`
- `evidence/run-demo-1/trace-1.zip`
