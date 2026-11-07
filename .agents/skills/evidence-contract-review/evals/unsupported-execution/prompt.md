---
tags: [skill-creator]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Dry-run only: You are an autonomous agent reviewing the evidence contract for a new analytics source. The user asked: "Can this source report per-model success rates and task costs?" The source only exposes classifier context and aggregate request counts; it does not expose executed agent outcomes, model success flags, task-level costs, or fallback inference events.

Provide a concise decision and rationale, but do not execute commands, edit files, access personal data, or contact GitHub. State which metrics can be derived directly from the contract, which require unsupported inference, and what contract change would be needed to support the missing metrics.
