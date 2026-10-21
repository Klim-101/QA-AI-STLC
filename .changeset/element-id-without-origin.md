---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/explorer': minor
'@qa-ai-stlc/cli': minor
---

An element id no longer contains the origin of its page: it is made from the environment's name and the page's path. The same environment served on another port, for example through a local configuration file, now gets the same ids, so the registry, the locator module and the generation stamps stop differing between machines. Elements already in the registry are re-keyed, with their names and history, the next time their environment is explored. The locator module and the generation stamps change once, in that run.
