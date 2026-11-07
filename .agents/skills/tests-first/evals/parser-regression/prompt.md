---
tags: [skill-creator]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Dry-run only: You are an autonomous agent fixing a parser regression. The user said: "The JSONL loader now silently drops records whose `model` field contains a forward slash. Fix it tests-first." There is already a fixture at `fixtures/jev-observe.jsonl` with representative records.

Provide a concise decision and rationale, but do not execute commands, edit files, access personal data, or contact GitHub. Describe the exact test you would add to `test/schema.test.ts`, what the failing assertion checks, and why the failure proves the behavioral bug rather than an import/setup error.
