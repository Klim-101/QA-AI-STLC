# Example reference file (template)

This file demonstrates what belongs under a skill's `references/` directory rather than in its
`SKILL.md` body: material a skill needs only occasionally, kept out of the file that loads on
every matching request.

Typical contents of a real reference file:

- The full field-level shape of a tool's structured output, when the body only needs the two or
  three fields the common path checks.
- A list of every error `code` a tool can return and the remediation for each, when the body only
  needs to say "on failure, read `code` and `remediation` from the result."
- Worked examples of an edge case that comes up rarely enough that walking through it in the main
  body would push every reader through it on every load.

`references/` files carry no line-count limit (`scripts/lint-agents.mjs` only walks
`SKILL.md` files) precisely because they are loaded on demand instead of every time.
