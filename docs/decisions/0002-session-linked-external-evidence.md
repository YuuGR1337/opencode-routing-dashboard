# 0002: Read-only contract for session-linked external evidence

## Status and context

**Research contract, approved by the maintainer on 2026-11-09 in [#5](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/5) as documentation only.** It defines meanings and states; it does not implement, collect, authorize or display anything. Classification (per `evidence-contract-review`): **B** (contract and validation) for this record; **C** (new integration and authorization) for any future collector. Related: [#4](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/4) (possible display surface, not a prerequisite), [#8](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/8), [#9](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/9).

Today the dashboard has no CI, pull request or human-approval source. The Sessions inspector ([SPEC](../SPEC.md)) shows retained local evidence only and leaves external evidence out of scope. Standard logs do not establish task success or human approval ([known limits](../KNOWN_ISSUES.md)).

## Decision

### 1. Manual association

External evidence attaches to a session only through an explicit **association record** created by the user:

| Field | Meaning |
| --- | --- |
| `sourceId` | The configured dashboard source that owns the session. Sessions are never joined across sources. |
| `sessionId` | Session identifier as retained by that source. |
| `repo` | One explicitly named repository (`owner/name`). |
| `pr` | Pull request number in `repo`. |
| `headSha` | Full 40-hex commit SHA the user is asking about. Abbreviated SHAs and branch names are rejected. |
| `associatedAt`, `associatedBy` | When and by whom the link was made (clock of the dashboard host). |

Rules: no inference from working directory, branch name, timestamps or message text; one record is one triplet; changing the SHA is a new record, never an edit; removing a record removes the link and shows no residue of evidence. The record says "the user asks about this"; it does not assert that the session produced the PR.

### 2. Evidence record and exact-SHA applicability

Each piece of external evidence carries: `kind` (`check-run`, `status`, `review`, `approval-event`), `repo`, `pr`, **`evidenceSha`** (the commit the item was reported against), `provider`, `providerRef` (id or URL), `observedAt` (when the dashboard fetched it), `providerTimestamp` (when the provider says it happened, may be absent) and a `result` as reported.

Applicability is computed, never stored:

- `evidenceSha == headSha` → **applicable**.
- `evidenceSha != headSha` → **not-applicable**, regardless of result. A green check on another SHA is never current green evidence. It may be listed as history, labelled with its own SHA.
- `evidenceSha` absent → **not-applicable** (cannot be tied to the commit). Unknown is not a match.
- PR `headSha` has moved since association → the association is **outdated** (see states); nothing is rewritten silently.

### 3. States

Every evidence slot (for example "required check X") is exactly one of:

| State | Meaning | Never means |
| --- | --- | --- |
| **current** | Applicable item fetched within the freshness window, result as reported (`success`, `failure`, `neutral`, `cancelled`, …). | Task success; only "this check reported this result for this SHA". |
| **pending** | Applicable run exists and has not completed. | Failing or passing. |
| **unavailable** | Could not be determined: no source configured, no authorization, provider error, rate limit, revoked access, or no item reported. Reason is shown. | Zero, none, or passing. Absence of checks is not success. |
| **outdated** | Applicable when fetched but older than the freshness window, or the PR head has since moved. | Still true. |
| **not-applicable** | Item exists but is for another SHA, or the slot does not apply (for example no checks required). | Missing; distinct from unavailable. |

Precedence when several items compete for one slot: applicable beats not-applicable; among applicable items, the latest `providerTimestamp` wins; ties surface as unavailable with reason "ambiguous" instead of picking one.

### 4. Freshness and provenance

- Freshness uses `observedAt` on the dashboard host plus the provider timestamp when present. Receipt time does not establish remote freshness across unsynchronized clocks; show both and label them.
- The freshness window is a configuration value to be chosen in the future integration decision; this record fixes no number. Evidence past the window becomes **outdated**, not deleted.
- Every displayed item shows source (`provider`, `repo`, `pr`), the exact `evidenceSha` next to the `headSha`, `observedAt`, `providerRef`, and its state. Retained local evidence and external evidence are visibly separate groups with separate labels.
- Checks and reviews are evidence about a commit. They are never combined into a session or task "passed/succeeded/done" verdict, a score, or a green/red session badge.

### 5. Human approval

Human approval of the session or task is **`unknown`** unless a qualifying **auditable approval event** exists. A qualifying event has all of: a named human actor, an explicit scope that names this `sourceId`+`sessionId` (or the association record), the exact `headSha` approved, a timestamp, and a tamper-evident reference to where it is recorded (for example a signed or provider-attributed record the dashboard can cite). Not qualifying by themselves: an approved PR review, a passing check, a merge, a bot comment, an emoji reaction, or a review of a different SHA. A review is shown as a **review** with its reviewer, state and SHA; it is not relabelled approval. Which source can provide qualifying events is an open decision (below); until one is chosen the state is permanently `unknown`, never `not approved`.

### 6. Read-only boundary

Future behavior stays read-only: no CI execution or re-run, no PR/review/comment writes, no merge, no automatic association, no collection from repositories not explicitly named in an association record, and no forwarding of source data to the provider. Credentials are never read from files by the dashboard process for this purpose without a separately approved mechanism.

## Synthetic cases (DEMO, not source verification)

All identifiers are invented. `A…` and `B…` stand for 40-hex SHAs. These are the cases a future implementation must pass.

| # | Setup | Expected |
| --- | --- | --- |
| 1 | Association head `A`; check `build` success on `A`, fetched just now. | `build`: current / success. Session shows no overall verdict. |
| 2 | Same, but PR head moved to `B`; only `A` evidence exists. | Association outdated; `A` items not-applicable to `B`; `build` for `B`: unavailable ("no item for this SHA") or pending if running. Never green. |
| 3 | Check `build` success on `B`, association head `A`. | not-applicable (shown with its own SHA). |
| 4 | No checks reported for `A`. | unavailable ("none reported"), not success, not not-applicable. |
| 5 | Check `build` in progress on `A`. | pending. |
| 6 | Check success on `A` fetched beyond the window. | outdated, with age shown. |
| 7 | Provider returns 403 after previously returning data (revoked access). | Prior items become outdated; slot shows unavailable "access revoked or denied"; no stale green. |
| 8 | Review `APPROVED` by a human on `A`, no approval event. | Review listed; human approval remains `unknown`. |
| 9 | Review `APPROVED` on `B`, association head `A`. | Review not-applicable; approval `unknown`. |
| 10 | Two checks with the same name and equal timestamps on `A`, conflicting results. | Slot unavailable, reason "ambiguous". |
| 11 | Same `sessionId` in two sources, association on source 1 only. | Source 2 shows no external evidence. |
| 12 | Association with abbreviated SHA or branch name. | Rejected at the boundary; no record created. |
| 13 | Qualifying approval event for `A` naming the session, plus failing check on `A`. | Approval shown as an event; check shown as failure; no combined verdict. |

## Alternatives considered

- **Automatic association** by working directory or branch: rejected; it infers a link the data does not establish and widens collection to repositories the user did not name.
- **Single green/red per session** from checks and reviews: rejected; it equates commit evidence with task success.
- **Treating an approved review as human approval:** rejected; a review is a statement about a diff, not an auditable approval of the session or task.
- **Starting with a UI panel:** deferred; a presentation needs its own acceptance (see #4 and DESIGN).

## Authorization decisions required before any integration

Listed for the maintainer; none is applied or implied here.

1. Which provider(s) and which repositories may be read, one explicit repository at a time.
2. Credential mechanism and scope (read-only, least privilege), where it is stored, and how revocation is detected. The dashboard must not read credential files or `.env*`.
3. Whether the dashboard process may make outbound requests to the provider, consistent with the rule that only explicitly configured endpoints may receive connections and source data is never forwarded.
4. Freshness window value and polling/rate-limit policy.
5. Source of qualifying human-approval events, or an explicit decision that approval stays `unknown`.
6. Where association records are stored (state is derived from files; no database) and their retention and deletion.
7. Presentation scope and design acceptance for any evidence panel, and the anonymization protocol before any longitudinal real-data validation.

## Verification and limits

This record is source-reviewed documentation: it was checked against [#5](https://github.com/crisesarmiento/opencode-routing-dashboard/issues/5)'s criteria, SPEC, KNOWN_ISSUES and the Sessions inspector scope. The synthetic cases are planned, not executed; no provider API was queried, so provider field names and semantics (for example how a check run reports its head SHA) are **unverified** and must be confirmed against official documentation in the integration step. No runtime behavior is claimed.

See the [roadmap](../ROADMAP.md) for where this sits in the sequence.
