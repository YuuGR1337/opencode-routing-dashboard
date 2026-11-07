---
tags: [skill-creator]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Dry-run only: You are an autonomous agent reviewing the evidence contract for federation. Two independent sources, `local` and `remote-pc`, both emit a record with the same synthetic `session_id` and `message_id`. The records represent the same conceptual turn observed from different vantage points.

Provide a concise decision and rationale, but do not execute commands, edit files, access personal data, or contact GitHub. State how the dashboard should store and transmit these records so that namespaces do not collapse, retention ranges remain per-source, and partially transmitted snapshots resume distinctly.
