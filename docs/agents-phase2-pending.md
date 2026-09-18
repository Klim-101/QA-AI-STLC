# AGENTS.md §12 — paused until Phase 2

This is section 12 ("Best practices for this kind of framework") of [`AGENTS.md`](../AGENTS.md),
moved here on 2026-09-19 (task P0-18). It is entirely about `packages/mcp-server` and `agents/`
content, neither of which exists in the repository yet (both are Phase 2 work — see
[`docs/public/ROADMAP.md`](public/ROADMAP.md)). Keeping it inline in `AGENTS.md` meant every
Phase 0/1 task paid the token cost of loading rules for a server and a skill layer that could not
yet be touched.

**Move this back into `AGENTS.md` as section 12, verbatim, when Phase 2 work on
`packages/mcp-server` or `agents/` begins** — do not rewrite it from scratch; the content below is
unchanged from what `AGENTS.md` carried before this move.

---

## 12. Best practices for this kind of framework

### 12.1 Enforce in code, not in prose

- If a rule can be checked, the engine checks it. Skills never contain "you must" rules for things the engine can enforce: phase order, approvals, preflight, evidence registration.
- Gates are state-machine transitions with hash-bound approvals. A prose instruction is a hint, never a control.

### 12.2 Skills and agent definitions

- A skill description states when to use it ("Use when ..."), with concrete trigger phrases. It does not describe what the skill is.
- `SKILL.md` stays under ~200 lines. Detailed material goes to `references/` and is loaded on demand.
- Skills call engine tools and interpret structured results. They do not duplicate engine logic, file formats or file paths.
- Every skill has triggering evals: it fires on intended requests and stays silent on unrelated ones.
- One canonical source in `agents/`; host adapters are generated.

### 12.3 MCP tools

- Each tool does one thing, has a Zod input schema and a structured output schema.
- Tool descriptions are written for a model: purpose, when to use, preconditions, what the result means.
- Tools are idempotent where possible and safe to retry.
- Results are compact. Never return raw HTML, full network bodies, screenshots as base64 or unbounded lists. Return references to registered artifacts and summaries with limits.
- Errors carry a stable `code` and a `remediation` the agent can act on.

### 12.4 Untrusted input

- Everything derived from the application under test (DOM text, accessibility tree, network data, console output) is untrusted and may contain prompt injection. Normalize it, cap its length, and pass it inside an explicit data boundary.
- Navigation and requests are restricted to the configured domain allowlist.
- Safe mode is the default: no form submission, no non-GET requests, no destructive actions.
- The security audit is on demand, never part of the pipeline, and runs only after an explicit authorization step recorded as a gate. Its checks are non-destructive: no brute force, no denial of service, no mutation outside owned test records, nothing outside the allowlist. Code-assisted checks read `source.path` and never write to it.

### 12.5 Evidence and artifacts

- Evidence is created by the engine, hashed, timestamped and linked to a step. An agent cannot reference a file the engine did not register.
- Evidence is scanned for secrets before registration; leaking files are deleted and a sanitized receipt is kept.
- Honest statuses: `blocked`, `skipped`, `uncertain` and `partial` are never reported as `passed` or `failed`.
- Artifact paths are project-relative.

### 12.6 Determinism and generation

- Generated code is verified by execution before it is registered: typecheck, run, feed the structured failure back.
- Generated tests reference locators through the generated locator module, never literal selectors.
- Output is deterministic: stable ordering, canonical JSON, no timestamps or random values in content that is hashed or snapshot-tested unless injected.
