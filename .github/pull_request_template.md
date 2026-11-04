Closes #

<!-- Base: `develop`. Only release PRs go develop → main. -->

## What changed
-

## How to verify (≤ 3 steps)
1.

## Acceptance criteria → evidence
| Criterion | Test or manual step |
|---|---|
|  |  |

## Evidence
- **Failing-before / passing-after test:** command + output (or CI run link).
- **Commands run:** `bun run typecheck` / `bun run lint` / `bun test` with exit codes.
- **Files touched:** … (all within the issue scope / justification)
- **Tests changed or deleted:** None / `<file>`: reason

## Screenshots (if UI)
<!-- docs/screenshots/*, reviewed against docs/DESIGN.md; list deviations. -->

## Checklist
- [ ] Base branch is `develop` (unless release PR)
- [ ] Typecheck, lint, tests green locally and in CI
- [ ] No tests weakened/skipped; scope limited to the issue
- [ ] `CHANGELOG.md` `[Unreleased]` updated, or N/A
- [ ] Docs (SPEC/DESIGN/ARCHITECTURE/PLAN) updated, or N/A: reason
- [ ] No real logs/prompts/secrets committed; server binds 127.0.0.1 only
