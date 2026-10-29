---
'@qa-ai-stlc/mcp-server': patch
---

Skills, the hub and the phase prompts no longer label a link with a path that starts with `agents/`, a folder the installed Claude Code and Codex plugins do not have (an agent looked for `agents/references/testing-standards.md` and skipped the field guidance). `npm run lint` now fails when a link label names a path that is neither the link's own target nor that target measured from the plugin root.
