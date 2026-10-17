---
'@qa-ai-stlc/core': patch
---

The generated `qa-reviewer` subagent has no file, shell or web tool (`disallowedTools: Read, Grep, Glob, Bash, Write, Edit, NotebookEdit, WebFetch, WebSearch`), so it cannot open the generating spoke's records in the project; the engine's own tools are what it keeps. Before, the independence of the review rested on the prompt alone.
