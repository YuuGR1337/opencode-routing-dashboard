---
tags: [skill-creator]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Dry-run only: You are an autonomous agent adding a UI test for the live SSE loading state. The user said: "Add a smoke test that verifies the exchange view shows a ready state after the SSE source connects, instead of waiting for networkidle." The view is implemented in `src/client/views/ExchangeView.tsx`.

Provide a concise decision and rationale, but do not execute commands, edit files, access personal data, or contact GitHub. Describe the test file, the render helper, the observable state to await, and the two viewport sizes for which screenshots must be captured per DESIGN.md.
