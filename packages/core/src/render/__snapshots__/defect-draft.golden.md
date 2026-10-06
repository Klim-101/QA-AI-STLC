# Invalid credentials show no error message

**Id:** defect-login-error-missing
**Proposed severity:** major
**Category:** functional
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

## Evidence

- `evidence/run-demo-1/screenshot-1.png`
- `evidence/run-demo-1/trace-1.zip`
