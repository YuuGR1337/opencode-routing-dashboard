---
tags: [skill-creator]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Dry-run only: You are an autonomous agent reviewing an open GitHub proposal for this repository. The user asked: "Please evaluate the proposal in issue #42 and tell me whether we should implement it. Do not implement anything yet."

Provide a concise decision and rationale, but do not execute commands, edit files, access personal data, or contact GitHub. You may read existing repository files (README, SPEC, DESIGN, CHANGELOG, source) to ground your evaluation. Your final response should state your verdict and list the concrete risks or open questions that must be resolved before implementation.
