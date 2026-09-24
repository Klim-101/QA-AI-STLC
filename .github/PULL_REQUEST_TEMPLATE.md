## Summary

<!-- What changes and why. One concern per pull request. -->

Closes #

## Type

- [ ] feat
- [ ] fix
- [ ] docs
- [ ] refactor
- [ ] test
- [ ] perf
- [ ] build / ci / chore

## Verification

<!-- Commands run and their results. List any check that could not be run and why. -->

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `npm run lint:generated`
- [ ] `npm run licenses:check`

## Checklist

- [ ] The title follows Conventional Commits and all commits are signed off (`git commit -s`).
- [ ] Tests cover the change (unit, plus integration if it crosses a module boundary); a bug fix includes a regression test; coverage does not drop below the package's threshold.
- [ ] Code follows AGENTS.md: style, naming, comments only where needed.
- [ ] If this touches safe mode, an allowlist, a hash/tamper check or another integrity mechanism, it passes the four-question self-review in AGENTS.md §12.7 (not just its own unit test).
- [ ] New source files carry the Apache-2.0 SPDX header; new dependencies use allowed licenses.
- [ ] No model calls, hosted services, tracker publishing or third-party MCP servers were added.
- [ ] No secrets, personal data, internal hostnames or employer-owned material are included.
- [ ] Generated trees were regenerated, not hand-edited.
- [ ] A changeset is added if users will notice the change (versioning and npm publishing happen automatically from it; no manual version bump).
- [ ] README, CONTRIBUTING, SECURITY, templates and AGENTS.md are updated if affected.
- [ ] The description links the task with `Closes #<issue>`; the roadmap text is updated if phase scope changed.
