# ADR-003: Hash-bound approval gates

Status: Accepted
Date: 2026-09-16

## Context

The framework's operator-in-the-loop promise only holds if an approval means what it says: the operator approved the artifact as it existed at the moment of approval, not some later edited version. A gate implemented as a status field (`approved: true`) on a mutable artifact cannot make that promise — anything can flip the field back, or worse, leave it set while the content underneath changes.

Agents can and do write directly into project files. An agent that touches an already-approved test plan to "just fix a typo" should not be able to silently carry that plan's `approved` status forward onto different content.

## Decision

An approval record stores the SHA-256 hash of the exact artifact content it approves, not just a boolean or a timestamp. `qa validate` recomputes the hash of the current artifact and compares it to the hash on file; a mismatch means the gate is no longer satisfied, regardless of any status field. Editing an approved artifact reopens its gate automatically, with no separate "did someone tamper with this" check required.

## Consequences

An approval is tamper-evident by construction: there is no way to keep an approval valid while changing what it approved. Re-approval after an edit is not a extra process step bolted on top of the gate; it is what "the hash changed" already means. This also gives the state machine a single, uniform rule for every gate instead of one bespoke check per artifact type.

The cost is that trivial edits after approval (fixing a typo in a test plan) force a full re-approval rather than a lighter "acknowledge the diff" flow. This is treated as acceptable friction, not a bug: a QA framework whose gates can be quietly kept open through small edits is not meaningfully different from one with no gates at all.
