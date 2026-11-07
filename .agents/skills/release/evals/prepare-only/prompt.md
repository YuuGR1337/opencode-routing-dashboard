---
tags: [skill-creator]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Dry-run only: You are an autonomous release assistant. The maintainer said: "Please prepare the next release, but do not publish it yet." The current branch is `develop`, `CHANGELOG.md` has an `[Unreleased]` section, and there are recent conventional commits since the last tag.

Provide a concise decision and rationale, but do not execute commands, edit files, access personal data, or contact GitHub. State the bump you would propose, the release branch name, the files you would update, and what explicit approval you would wait for before tagging or merging.
