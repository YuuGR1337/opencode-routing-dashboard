---
name: evidence-contract-review
description: Review evidence and attribution before changing a parser, source, join, metric, alert, export, or visualization claim. Use for source contracts and unknown/partial data; not for formatting-only edits.
---

# Evidence contract review

Protect the distinction between what the source establishes and what a UI would like to show. This workflow guides review; schemas, tests, permissions and CI must enforce applicable boundaries.

## Review before implementation

1. Read [SPEC](../../../docs/SPEC.md), [known limits](../../../docs/KNOWN_ISSUES.md), and the relevant source/parser/fixture. Do not read personal logs, prompts or credential files. Use anonymized fixtures and official contracts; ask for authorization before adding a source or integration.
2. Write an evidence table for each proposed field/measure: source and version, whether actually emitted or only accepted by a parser, meaning, identity/join key, timestamp/clock, unit, range/denominator, and missing/partial/not-applicable behavior. Mark synthetic examples DEMO, not source verification.
3. Classify the proposal: **A** existing data; **B** contract/data validation required; **C** new telemetry/integration/authorization; **D** product-scope change. Classification is not permission. Surface unresolved prerequisites rather than implementing a plausible substitute.
4. Preserve source identity. Never join different configured sources; match observe/route only by the documented session and non-null message contract. Keep retained aggregates, transmitted detail suffixes, evictions, malformed process-lifetime counts and independently ranged stats distinct. Do not claim a complete session from a retained sample or sum overlapping snapshots.

## Claims that require explicit evidence

- Jev's role is a suggestion; injection is not delegation. The observe model identifies the classifier, not execution. Recorded context is not proof of the executed agent.
- Standard logs do not establish execution model, per-task tokens/cost, actual fallback attempts/reasons, task success, human approval, effective process preset, or parent/child task relations.
- Accepted enrichment fields do not prove an upstream emitter exists. A sampled preset file does not prove runtime selection or historical use.
- Unknown is not zero. No errors is not success; repeated errors is not stalled progress without a progress contract. Observed event span is not task execution duration.
- Never distribute aggregate stats among calls/tasks/presets or invent USD/subscription limits. Keep user limits, estimates and coverage labeled.
- Future external evidence uses explicit manual session↔PR↔headSHA association; another SHA is not applicable. An approved review is not an auditable human-approval event by itself. Do not fetch external evidence without declared authorization.

## Output and verification

5. Report supported facts, gaps, excluded interpretations and proposed unavailable labels. For a code change, map each claim to [tests-first](../tests-first/SKILL.md) cases: missing/enriched/invalid input, source collisions, mismatched ranges, partial retention and unknown values. Test complete raw-record preservation for displayed events without exporting sensitive unknown fields by default.
6. A future diagnostics/export feature needs an allowlist and a defined privacy boundary; a raw debug dump is not safe because known prompt fields were removed. Keep detailed measurement opt-in and bounded. Local receipt/processing time does not establish remote freshness or end-to-end latency across unsynchronized clocks.
7. Close with exact evidence and limits: observed functioning, documented, inferred, or unverified. Never promote a fixture, static test, or review approval into an unsupported runtime claim. See [agent workflow guidance](../../../docs/AGENT_WORKFLOWS.md).
