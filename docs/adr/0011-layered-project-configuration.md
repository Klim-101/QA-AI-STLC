# ADR-0011: Layered project configuration

Status: Accepted
Date: 2026-09-28

## Context

Every project is configured by one committed file, `.qa/config.yaml`, validated as a whole against
`ConfigSchema`. That fits one team on one machine, but real use splits the configuration into two
kinds of values:

- **Team decisions** that every machine must agree on: the testing scope, the API contract, the
  selector policy, the test-data strategy, the flaky-detection thresholds. The `cases` gate
  (ADR-003) reads the testing scope, and generated locator modules (ADR-006) depend on the selector
  policy, so two machines that disagree on these produce different gate results and different
  generated code from the same artifacts.
- **Machine facts** that legitimately differ per operator or per CI runner: a local dev server on
  another port, a personal identity, where the source checkout lives, how much parallelism the
  machine can afford.

Today the only way to express a machine fact is to edit the committed file, which either leaks one
operator's setup into everyone's checkout or forces local edits that must never be committed.

Some values in the second group are also safety controls. The environment allowlist bounds every
navigation and HTTP call (AGENTS.md 12.4), and `tlsInsecure` disables certificate validation. An
override mechanism that can change them quietly would turn a reviewed, committed boundary into one
nobody sees. The plugin's `PreToolUse` hook blocks an agent's `Write`/`Edit` under `.qa/**`, but not
a shell command, so an override file cannot be assumed to have been written by the operator.

Options considered for where overrides come from: a git-ignored local file; per-key `QA_*`
environment variables; a generic per-environment `overrides` block inside `config.yaml`; CLI flags
per command.

## Decision

The effective configuration is built from at most two layers, merged in this order:

1. **Committed layer**: `.qa/config.yaml`, required, as today.
2. **Local layer**: one override file, optional. By default `.qa/config.local.yaml`, which
   `qa init` adds to `.qa/.gitignore`. When the `QA_CONFIG_LOCAL` environment variable is set, it
   names the file to use instead (absolute, or relative to the project root) and the default file is
   not read; a missing file named this way is an error (`CONFIG_LOCAL_MISSING`), since an explicit
   selection that silently loads nothing would hide a broken CI setup.

Top-level sections are classified, and the classification is part of the schema, not documentation:

| Section                                                         | Local layer may set it                      |
| --------------------------------------------------------------- | ------------------------------------------- |
| `environments`, `identities`, `source`, `agents`                | Yes                                         |
| `schemaVersion`, `testing`, `api`, `data`, `selectors`, `flaky` | No                                          |
| Any section added later                                         | No, unless its task classifies it otherwise |

A local layer that sets a section it may not set fails with `CONFIG_OVERRIDE_NOT_ALLOWED`, naming the
key and the file. It is never silently ignored.

**Merge rules.** Objects merge key by key, so the local layer can add an environment or identity, or
change individual fields of an existing one. Arrays and scalars replace the committed value. A key
cannot be deleted by the local layer. The merged result is validated against `ConfigSchema`
(including its cross-field refinements); an error names the layer each offending value came from.
The loader keeps the source layer of every leaf value so `qa config show --explain` (P6-22) can print
it.

**Relaxations are reported, not blocked.** The operator writing a local file has the same authority
as the operator editing `config.yaml`, so widening is allowed, but never silently. The loader
returns a relaxation for every effective value that is less safe than the committed layer:

- an allowlist entry of an environment that the committed layer does not list for that environment
  (every entry of an environment that exists only in the local layer counts);
- `tlsInsecure: true` where the committed layer does not set it.

Relaxations are printed on every CLI command that loads the configuration (stderr, one line each),
and listed by `qa doctor`/`qa.doctor` and `qa config show`/`qa.config_show`.

**Invariant.** Every value that feeds a gate, a hash or generated code comes from a section the local
layer may not set, so gate results and generated files are identical on every machine for the same
committed artifacts.

**Not adopted:** per-key `QA_*` override variables and a generic per-environment `overrides` block.
Environment-specific values that P6-23 moves into config become explicit fields of the environment
entry, the way `tlsInsecure` already is.

## Consequences

An operator or a CI job can point the framework at its own server, identity, checkout and budget
without touching the committed file; CI writes a file and sets `QA_CONFIG_LOCAL`, which keeps the
override visible in the pipeline definition. One rule set (the local layer's) covers both cases.

A preview-deployment host that changes per pull request still cannot be reached without adding it
to an allowlist: hostnames are exact (no wildcards), and adding one from a local file is reported
as a relaxation. This is deliberate; the allowlist stays an enumerated boundary.

The protection is visibility, not prevention: an agent with shell access could still write a local
file. Reporting relaxations on every command, including in `qa doctor` that the `qa-start` hub runs
first, is what keeps that from being silent. Relaxations reach an MCP-only session only through
`qa.doctor` and `qa.config_show`, not through every tool result, to keep results compact
(AGENTS.md 12.3).

`qa.http_execute` currently accepts `tlsInsecure` directly from the caller, which bypasses the
environment's configured value and contradicts this decision; it is fixed as its own task, not as
part of the loader change.

Rejected alternatives:

- **Per-key `QA_*` variables**: environment names are free-form (`staging-eu`), so mapping them to
  variable names is lossy and ambiguous, and every new key would need its own variable. Selecting a
  whole file covers the same CI need with the same validation.
- **A generic `overrides` block per environment**: a second merge mechanism inside the committed
  file, for values that can simply be fields of the environment entry.
- **Forbidding allowlist widening in the local layer**: it would make a local-only environment
  (for example a developer's own server) impossible without committing it.
