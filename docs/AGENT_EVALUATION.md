# Agent guidance: initial qualitative evaluation

## Scope and method

Reviewed on 2026-11-07 during the agent-guidance/documentation change. Two representative reasoning scenarios were dispatched in paired lanes: explicit skill loading and a no-skill general-reasoning baseline. They are dry runs, not actions against Git, personal logs, services, browsers or GitHub. The checked-in case library contains ten cases; only these two representative scenarios received the paired review described here.

The baseline for the evidence scenario read its prompt and expected-outcome file, but not the skill or graders. The explicit-load lane read those same case files plus the skill. The UI scenario used the same hypothetical question in both lanes; only its explicit-load lane read the UI skill. Shared agent/harness instructions still apply, so this is not a clean model-independent ablation. Reviewing the expected outcome also makes the evidence scenario an instructional check rather than an unbiased task benchmark.

After the UI procedure was clarified against the actual verifier, its explicit-load lane reread the final procedure and answered again in the same child session. The response below is that revalidation, not a fresh independent trial. Baseline responses remain unchanged. No timing/token measurements were supplied for these runs, and none are inferred.

## Evidence scenario

**Question:** A source exposes classifier context and aggregate request counts, but no execution identity/outcomes, task costs or fallback events. Can it report model success rates and task costs? What contract would be needed?

### Explicit-load response

> The contract supports aggregate request counts and classifier-context reporting only. It does not establish which model or agent actually executed, task outcomes, task-level costs, or fallback attempts/reasons. So per-model success rates, task costs, and fallback metrics cannot be derived; inferring them from classifier context or aggregate counts would be unsupported.
>
> To support those metrics, the source would need to emit execution records that identify the executed model/agent and link each record to a task, with an explicit outcome, task-level cost and currency (or token usage with a defined costing method), and explicit fallback events with reasons. Until then, show these metrics as unavailable—not zero or estimated.

### No-skill baseline response

> The source supports classifier-context fields and aggregate request counts, so those can be reported directly. It cannot support per-model success rates, task-level costs, or fallback-inference metrics: it lacks executed-agent outcomes, model success flags, task costs, and fallback events. Inferring these from classifier context or aggregate counts would not be justified.
>
> To support the missing metrics, extend the contract with execution-level records that identify the requested and executed model, outcome/success status, task-level cost (with currency and attribution), and explicit fallback events linking the original request to the fallback execution. Until then, report only the available context and aggregate counts, and mark the requested metrics unavailable.

### Review

Both responses reject unsupported attribution, preserve the available aggregate/context facts, and require additional linked execution evidence. The explicit-load response makes the unavailable-versus-zero distinction explicit. Neither implements an integration. Any future costing method still needs a declared authorized source and separate scope; tokens alone do not establish real subscription billing or an allowable USD metric. Likewise, an emitted outcome flag needs a validated definition before it becomes a task-success claim.

This scenario does not discriminate strongly: the baseline already identifies the core evidence gap, and the prompt/expected outcome supplies much of the intended boundary.

## UI scenario

**Question:** A canonical UI verifier runs against a live multi-source exchange demo. Checks fail on expected session names/timestamps while source-health and navigation checks pass. Should the app, assertions or setup change? What does the run establish?

### Explicit-load response after procedure revalidation

> Don't patch the app or rewrite assertions based on these failures alone. The real-agent exchange demo shifts fixture timestamps, so its session names/timing are not the canonical verifier's contract. Match dataset and harness: use canonical fixtures with the canonical verifier, or verify the exchange demo under its own contract. Keep assertions intact unless an approved DESIGN revision explicitly changes presentation expectations.
>
> Before launching the demo, check whether its missing-dist/index.html precondition would trigger a build; in a read-only review, use approved existing assets or an isolated output, or report runtime verification unavailable. Isolate paths and use anonymized data. The exchange sub-harness stubs EventSource, so it establishes controlled UI behavior, not real multi-source transport. Passing source-health/navigation checks establishes only those observations; it does not validate failed canonical expectations or live transport. Report exact results and gaps. Don't infer live-update pause behavior from replay pause or full reduced-motion behavior from preference/CSS checks.

### No-skill baseline response

> Don't patch the app or rewrite assertions based on this result alone. First check that the verifier's expected names and timestamps match the demo's documented, deterministic inputs. Then rerun the canonical verifier against a clean, isolated demo with those inputs; preserve the original failures and capture the run details. If the expectations are stale, update the verification setup transparently and rerun—don't weaken checks merely to get a pass. Patch the app only if reproducible failures show behavior that violates the intended contract.
>
> Passing source-health and navigation checks establishes only that those checks passed in that run. The session-name and timestamp failures remain unresolved, so the demo is not verified overall; the result does not by itself establish an app defect.

### Review

Both responses avoid an unjustified patch and preserve partial-result boundaries. The skill-informed response adds repository-specific information that the baseline does not establish: separate canonical/exchange dataset contracts, the implicit demo build, simulated EventSource coverage, and the limits of replay/reduced-motion assertions. The baseline's clean-demo wording leaves the exact dataset selection unresolved; it is not proof that the baseline would choose the wrong input if allowed further investigation.

## Conclusions and remaining work

- The procedures can be explicitly loaded and applied to these representative reasoning questions.
- A procedure review found concrete harness limitations and the UI skill was refined to state them, rather than claiming the existing scripts cover every desired check.
- Structural Bun tests validate files, metadata, local links and case shape separately. They do not judge these responses or prove automatic discovery.
- No actual parser fix, browser run, release, service lifecycle change, or performance benchmark was performed by these dry runs.
- No speed, token, success-rate or general skill-effectiveness improvement is established. Do not summarize the tiny sample as a percentage gain.
- Automatic triggering, negative near-misses, repeated runs with a declared model/version, and the other checked-in cases remain future evaluation work. No new eval service, billed CLI, permission or dependency is authorized by this report.

See [agent workflow guidance](AGENT_WORKFLOWS.md) and the case directories under `.agents/skills/` for the reusable inputs. A local static review viewer can display the paired outputs; it is a temporary review artifact, not a shipped app feature or a required network service.
