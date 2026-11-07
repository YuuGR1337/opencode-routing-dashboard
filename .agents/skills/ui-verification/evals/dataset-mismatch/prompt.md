---
tags: [skill-creator]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Dry-run only: You are an autonomous agent running the canonical UI verifier. The user said: "`scripts/verify-ui.mjs` failed when I pointed it at `scripts/demo-exchange.ts` with `fixtures/exchange`." The canonical verifier is meant to run against a temporary copy of the canonical fixtures, while the exchange demo is a separate smoke test.

Provide a concise decision and rationale, but do not execute commands, edit files, access personal data, or contact GitHub. Explain the likely contract mismatch, identify the correct documented dataset for controlled canonical checks, and keep the exchange demo as a separate smoke test. Do not conclude product regression or weaken the existing tests based on these failures alone.
