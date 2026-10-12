---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
---

New `qa status` command and `qa.status` tool: the pipeline gates plus an ordered list of next actions. Once the last gate (`cases`) is approved it names what follows outside the pipeline: exploring the application, executing approved cases that have no passing result, and generating tests for passing ones, each with the skill and first tool to use. The hub and `qa-start` relay it instead of saying nothing comes next.
