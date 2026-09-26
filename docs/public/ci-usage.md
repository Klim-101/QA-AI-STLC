# CI usage: a no-model pipeline

Everything the deterministic engine does — building a selector registry, running a spec, checking
gates and evidence — is a plain CLI invocation with no model call anywhere in it. That means the
whole thing runs in an operator's own CI the same way it runs on a laptop: no API key, no billed
call, no non-determinism to explain away in a failed build.

This page documents the recipe. The exact same steps run continuously in this repository's own CI
as [`.github/workflows/example-ci-usage.yml`](../../.github/workflows/example-ci-usage.yml) against
the real running [demo app](../../examples/demo-app), so this page never describes a capability
that has quietly stopped working.

## What the recipe proves

1. **`qa explore` / `qa explore --verify`** — builds the selector registry from the real,
   running application, then re-checks every stored locator against the live page. A locator that
   no longer resolves (a renamed `data-testid`, a moved element) fails the job instead of a test
   silently breaking for an unrelated reason later.
2. **`qa link`** — registers an already-existing, hand-written Playwright spec in the requirement →
   case → result → evidence traceability matrix, without generation. Most teams adopting the
   framework already have specs; this is how they fold in without rewriting anything.
3. **`qa run`** — executes the spec set and records every result, honestly reporting `partial`
   rather than `passed`/`failed` when a test did not reach every declared step.
4. **`qa validate --run`** — re-sweeps every gate, every requirement link and, with `--run`, every
   recorded result's evidence for tampering. A hand-edited artifact fails this step, not a review
   that happened to notice.

## The recipe

Requires Node (the version in [`.node-version`](../../.node-version)) and a project with
`@qa-ai-stlc/cli` installed (`npm install -D @qa-ai-stlc/cli`) plus a running instance of the
application under test. Adjust `BASE_URL` and the spec path for your own app.

```sh
qa init --e2e in-scope --api out-of-scope --a11y out-of-scope --security out-of-scope --defer-scope
qa config add environment ci --base-url "$BASE_URL" --allowlist "$ALLOWED_HOSTNAME"

# Builds the selector registry from the real, running application.
qa explore --environment ci
# Fails the job if a stored locator no longer resolves on the live page (selector drift).
qa explore --environment ci --verify

# Folds an already-existing, hand-written spec into traceability, reusing its own testCaseId
# annotation (test(title, { annotation: { type: 'testCaseId', description: '<id>' } }, ...)) when
# present. requirement-id must already be registered via "qa scope".
qa link tests/my-spec.playwright-spec.ts requirement-id --feature my-feature

qa run --spec tests/my-spec.playwright-spec.ts

# Re-sweeps every gate, requirement link and, with --run, every result's evidence.
qa validate --run

qa report
```

A CI job wires this into the standard checkout / install / build steps:

```yaml
steps:
  - uses: actions/checkout@v7
  - uses: actions/setup-node@v7
    with:
      node-version: '22'
  - run: npm ci
  - run: npx playwright install --with-deps chromium
  # Start your own application under test here, then wait for it to be reachable.
  - run: |
      qa init --e2e in-scope --api out-of-scope --a11y out-of-scope --security out-of-scope --defer-scope
      qa config add environment ci --base-url "$BASE_URL" --allowlist "$ALLOWED_HOSTNAME"
      qa explore --environment ci
      qa explore --environment ci --verify
      qa link tests/my-spec.playwright-spec.ts requirement-id --feature my-feature
      qa run --spec tests/my-spec.playwright-spec.ts
      qa validate --run
```

See [`.github/workflows/example-ci-usage.yml`](../../.github/workflows/example-ci-usage.yml) for the
complete, currently-passing version of this recipe against the demo app, including how it starts
the application under test and waits for it to be reachable before the pipeline runs.

## What this does not cover

- **Generating a spec from a test case** (`qa-generate-tests`) is a separate, model-assisted
  capability that runs inside the agent host, not in CI — see the
  [roadmap](ROADMAP.md) for its status. This recipe only runs a spec that already exists.
- **API, accessibility and security runners** are Phase 6 work; only `e2e` (Playwright) has a
  runner today.
