---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/explorer': patch
'@qa-ai-stlc/cli': patch
'@qa-ai-stlc/runner-security': patch
---

A scripted sign-in now checks its login page against the environment allowlist on every path. Before, only `qa run` and the security audit did, so exploring or opening a browser session could send an identity's password to a page outside the allowlist.
