---
tags: [skill-creator]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Dry-run only: You are an autonomous agent performing a read-only UX review. The user asked: "Review the exchange view for readiness issues when the SSE source starts in an empty state." You may inspect the code and DESIGN.md, but you must not access real logs, install browsers, build the project, or contact GitHub.

Provide a concise verification plan and rationale only; do not execute commands or edit files. Describe an isolated temporary setup with anonymized explicit input paths, observable validated-state/render readiness, and the gaps that remain if approved built assets or browser tooling are unavailable. Do not assume that an SSE connection-open event proves readiness or that the current app has a dedicated loading state.
