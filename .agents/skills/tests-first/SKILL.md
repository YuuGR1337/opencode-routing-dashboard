---
name: tests-first
description: Write a failing bun test first, then the fix or feature. Use for every bug fix and every new parser, aggregator, endpoint or view.
---

# Tests first

1. Reproduce: expected vs actual, smallest input (a fixture line, an appended JSONL line, a stats JSON).
2. Pick the closest test file under `test/` (`*.test.ts`); add a case. Fixtures live in `fixtures/` and stay anonymized.
3. Run it before touching code: `bun test test/<file>.test.ts`. It must fail for the right reason (not a typo/setup error).
4. Make the smallest change that passes. Re-run the file, then `bun run typecheck && bun run lint && bun test`.

## What to test
- Observable behavior: parsed records, aggregates, HTTP/SSE responses, rendered output. Not private helpers.
- Expected values come from SPEC.md / fixtures, never from running the code.
- Two imaginary edits: breaking behavior must fail the test; refactoring internals must keep it passing.
- Never weaken, skip or delete a test to go green.

## UI verification
Smoke render test per view + Playwright screenshots (1440×900, 1024×768) into `docs/screenshots/`; open them and check against `docs/DESIGN.md`.
