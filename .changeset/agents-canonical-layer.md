---
'@qa-ai-stlc/schemas': minor
---

Adds `SpokeResultSchema`, the generic Zod-validated envelope every hub-and-spoke result flows
through (development plan section 5.1, P2-08): a `status: 'ok' | 'error'` discriminated union
carrying either an untyped `payload` a caller validates against its own task-specific schema, or a
structured `SpokeError` (a stable `code`, a `message`, and optional `issues` describing exactly
what a re-dispatch should fix). Also exports the supporting `SpokeErrorSchema` and
`SpokeValidationIssueSchema`. Per-spoke-type payload schemas are added by the tasks that implement
those spokes; this change adds only the shared envelope.
