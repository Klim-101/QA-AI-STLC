# Changesets

This directory manages package versioning and changelogs. See the
[Changesets documentation](https://github.com/changesets/changesets) for the full guide, and
AGENTS.md section 4 (step 6) and section 8.4 for how this project uses it.

Add a changeset for any change that affects a published package's behavior:

```sh
npx changeset
```

## Version policy

- `packages/schemas` versions independently: its version tracks compatibility of the artifact
  schemas, and a breaking schema change ships with a migration.
- Every other publishable engine package (`packages/core`, `packages/explorer`, `packages/cli`,
  `packages/mcp-server`, `packages/runner-*`) shares one version number. As each of those packages
  is added to the `packages/` workspace, add its name to the `fixed` group in `config.json` so
  they version and release together.
- `packages/test-utils` is private and never published; it stays in `ignore`.

Never bump a version or run `npm publish` by hand (AGENTS.md 8.4). The release workflow reads
merged changesets and does this automatically.
