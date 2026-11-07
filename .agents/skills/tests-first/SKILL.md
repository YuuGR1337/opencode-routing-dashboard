---
name: tests-first
description: Write a failing bun test first, then the fix or feature. Use for every bug fix and every new parser, aggregator, endpoint or view.
---

# Tests first

1. Reproduce expected versus actual with the smallest controlled input: an anonymized JSONL line, stats response, or rendered state. State what must remain unchanged. Use [the evidence review](../evidence-contract-review/SKILL.md) when the change affects a source, join, metric, or claim.
2. Pick the closest `test/*.test.ts` or `test/*.test.tsx` file. Existing fixtures live in the repository-root `fixtures/` directory. Add a behavior assertion before changing the implementation; do not install dependencies or access personal data to create a reproduction.
3. Run the focused case first, for example `bun test test/<file>.test.ts -t '<case>'` or `bun test test/<view>.test.tsx`. Capture its exit status and failing assertion. A missing import, typo, or broken setup is not evidence of the intended behavioral failure. New documentation-only artifact guards may fail on the missing artifact, but must be labeled structural evidence, not a runtime red/green claim.
4. Make the smallest change that passes. Re-run the focused case/file and adjacent affected checks. Preserve the original regression assertion; do not derive expected values from the changed implementation.
5. After all writers are reconciled, the integrator runs `bun run typecheck`, `bun run lint`, and `bun test`; include build/browser checks when the changed boundary requires them. Specialists own focused checks, not repeated independent full suites. Revalidate affected evidence after later edits and report failures rather than weakening tests.

## What to test
- Observable behavior: parsed records, aggregates, HTTP/SSE responses, rendered output. Not private helpers.
- Expected values come from [SPEC](../../../docs/SPEC.md), an explicitly approved contract, and independently specified fixtures, never from copying current output.
- Two imaginary edits: breaking behavior must fail the test; refactoring internals must keep it passing.
- Never weaken, skip or delete a test to go green.

## UI verification
Use [ui-verification](../ui-verification/SKILL.md): smoke render tests per view, observable readiness rather than `networkidle` for the live SSE app, and reviewed screenshots at 1440×900 and 1024×768 for UI changes. Screenshots do not replace interaction assertions. Pure guidance changes do not require fabricated UI captures.
