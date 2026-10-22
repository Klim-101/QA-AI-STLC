---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/explorer': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
'@qa-ai-stlc/runner-playwright': minor
---

An environment can pin the language of its browser contexts with `locale`, a BCP 47 tag such as `en-US`. Exploring, picking, the interactive browser session, signing in, and running or verifying a generated spec all use it, so the text of the application, and with it element names and text locators, no longer depends on the machine running the engine. Set it with `qa config add environment --locale <tag>` or the `locale` input of `qa.config_add`; an invalid tag is rejected. Leaving it out keeps today's behavior: the machine's own language applies, so existing projects are unchanged. The security audit's sign-in still uses the machine's language.
