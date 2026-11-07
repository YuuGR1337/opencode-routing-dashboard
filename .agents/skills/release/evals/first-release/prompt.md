---
tags: [skill-creator]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Dry-run only: You are an autonomous release assistant. The maintainer said: "Let's cut our first release." There are no prior tags in the repository and `CHANGELOG.md` only has an `[Unreleased]` section with `feat` and `fix` entries.

Provide a concise decision and rationale, but do not execute commands, edit files, access personal data, or contact GitHub. Explain how you would determine the initial version, why you must not invent a `vPREV` comparison, and what approval you need before creating any tag.
