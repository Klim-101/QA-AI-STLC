# Root cause analysis: login-error-missing

**Defect:** login-error-missing
**Status:** draft

## Facts

- The login request returns 401 with an error body
- The page does not render the error body

## Hypotheses

1. The error handler is not wired to the login form (confidence: high)
   - Evidence needed to confirm: The component source for the login form submit handler
2. A recent refactor dropped the error state (confidence: low)

## Evidence

- `evidence/run-demo-1/console-1.log`

## Remediation

- Render the error body returned by the login request

## Regression recommendation

Add an end-to-end case that submits bad credentials and expects the message.
