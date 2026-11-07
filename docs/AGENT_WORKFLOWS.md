# Agent workflows and skill maintenance

## Purpose and boundaries

Make recurring work easier to verify without adding a framework, dependencies, external telemetry, or new permissions. This document describes contributor procedures, not shipped product features. The [roadmap](ROADMAP.md) distinguishes future direction from implementation approval.

| Layer | Responsibility | Not a substitute for |
| --- | --- | --- |
| [AGENTS.md](../AGENTS.md) | Short shared invariants, commands, boundaries and entry points | An exhaustive code map or sandbox |
| `.agents/skills/<name>/SKILL.md` | Task-specific reusable procedures loaded when relevant | Authorization or deterministic enforcement |
| `docs/` | Versioned contracts, evidence, decisions and rationale | A claim that a proposal already ships |
| Schemas, tests, CI and harness permissions | Enforce the applicable technical boundary | Human product/release approval |

Keep the current `src/core`, `src/sources`, `src/server`, `web`, `test`, `fixtures`, `scripts`, and `contrib` boundaries. No monorepo or directory migration is needed to maintain these skills. Future Electron code must preserve the service/CLI boundary and isolate main/preload/renderer responsibilities; its final file layout is not chosen here.

## Canonical skill source and discovery

The canonical project source is `.agents/skills/`. Each skill has portable lowercase `name` and a task-oriented `description`; optional supporting references/scripts are loaded only as needed. A new script is justified by deterministic recurring work, not by a need to make a skill look complete.

| Skill | Use when | Do not infer |
| --- | --- | --- |
| [branch-and-pr](../.agents/skills/branch-and-pr/SKILL.md) | Approved implementation/docs and PR preparation | An open issue or research request approves coding |
| [tests-first](../.agents/skills/tests-first/SKILL.md) | Bug fixes and new observable behavior | A missing import proves a behavioral regression |
| [release](../.agents/skills/release/SKILL.md) | Cristian explicitly requests release work | Preparation authorizes merges, tags or publishing |
| [evidence-contract-review](../.agents/skills/evidence-contract-review/SKILL.md) | Sources, parsers, joins, metrics, alerts and displayed claims | Parser enrichment is emitted upstream |
| [ui-verification](../.agents/skills/ui-verification/SKILL.md) | UI behavior/design verification using isolated data | A screenshot proves interaction, accessibility or platform coverage |

Format portability does not guarantee discovery or enforcement. OpenCode's current documentation includes `.agents/skills` and documents ID precedence; duplicate IDs can replace content rather than merge it. Other harnesses have different locations, version requirements and instruction-loading behavior. Do not copy the same policy into `.claude`, `.cursor` and `.opencode` by default.

Before claiming compatibility with a particular harness, record its version, session location, discovery method, and the actual skill file loaded. Use a native listing/invocation facility when available; otherwise explicitly read the canonical file and label that a manual fallback. We have not run a cross-harness automatic-discovery matrix in this change. Instructions about `AGENTS.md` loading are separate from discovery of `SKILL.md` files.

## Verification ownership

1. The implementation lane runs its closest focused tests and captures a meaningful failing-before/passing-after result for behavior changes.
2. The integrator reconciles all writers and runs mandatory typecheck/lint/tests. Build, browser and packaged-platform checks follow the changed boundary. Reuse still-valid evidence; later edits require affected revalidation.
3. The PR maps each criterion to evidence and explains skips. No new tool/dependency or personal-data access is authorized merely because a skill mentions it.
4. A maintainer review, `Decision: Approved`, or passing CI each means something different. Do not merge those claims into task success or a human-approval telemetry event.

The [verification record](VERIFICATION.md) documents historical runtime evidence. Do not repeat those results as if they were run in the current task.

## Safe dry-run evaluations

Each skill contains two cases under `evals/<case-name>/`:

- `prompt.md`: a dry-run reasoning prompt and runner settings.
- `case.yaml`: schema version, case name and expected outcome.
- `graders/*.md`: concrete review assertions.

These are anonymized workflow instructions, not captured user/source prompts. They ask for a plan or review, not execution of Git, servers, releases, installs or personal-data reads. The settings constrain compatible runners only; they do not grant permissions or provide a universal sandbox. Review any runner before using it.

| Skill | Cases and intended boundary |
| --- | --- |
| branch-and-pr | Evaluation-only work must not create a branch; unrelated dirty work must not be stashed/reset/switched away |
| tests-first | Parser regression needs a behavioral red first; a live SSE view needs observable readiness and UI evidence |
| release | Preparation is not publication; no prior tag must not produce an invented comparison ref |
| evidence-contract-review | Classifier/aggregate facts must not become execution/task claims; sources/ranges must not be conflated |
| ui-verification | Demo review stays isolated with explicit inputs; canonical/exchange fixture mismatch must not weaken tests |

`test/agent-guidance.test.ts` checks document/skill metadata, local links and case structure. It does **not** prove that a model selects, follows or benefits from a skill. Separate these evidence levels:

1. **Structural validation:** files, metadata, links and cases are consistent.
2. **Explicit-load dry run:** an independent reviewer reads the procedure and responds to a case without taking the described actions. Record response and assertion-level findings, including failures.
3. **Automatic activation:** a specified harness/version chooses the relevant skill on positive and negative prompts. Not established by explicit loading.
4. **Comparative effectiveness:** repeat representative tasks with a declared baseline, model, tools, outcomes and costs. A small reasoning review does not establish a performance improvement.

For a new revision, select representative cases including near-misses that should not activate the skill. Compare with the previous skill where a baseline exists. Keep reports outside tracked fixtures, label samples and uncertainty, and let the maintainer inspect qualitative outputs. Do not run billed model-evaluation CLIs, install a viewer, or grant permissions implicitly. A viewer may be generated with existing approved tooling; it is not required to inspect the checked-in cases.

The [initial qualitative evaluation](AGENT_EVALUATION.md) records two paired explicit-load/baseline scenarios, a UI-procedure revalidation, and their limitations. It is not an automatic-trigger test or evidence of a general performance gain.

## Third-party material and references

Research reviewed on 2026-11-07 informed these project-specific procedures. No external skill, helper script or package was installed or copied into the repository. Links below are references, not commands to fetch and execute instructions. If adopting material later, inspect the exact files, dependencies, network behavior and license, preserve attribution, pin a reviewed revision, and evaluate against this project's contracts.

- [Agent Skills specification](https://agentskills.io/specification): portable metadata, supporting resources and progressive disclosure. Format validation is not behavior validation.
- [OpenCode skills](https://opencode.ai/docs/skills): current discovery and ID precedence. [Instructions](https://opencode.ai/docs/instructions) and legacy pages can differ; verify the target version rather than mixing configuration shapes.
- [Claude Code memory](https://code.claude.com/docs/en/memory) and [skills](https://code.claude.com/docs/en/skills): harness-specific loading and version-dependent behavior; not a reason to duplicate all files.
- [OpenAI harness engineering](https://openai.com/index/harness-engineering/): short entry points, recoverable repository knowledge and observable feedback. Its autonomy/merge choices do not override our maintainer review policy.
- [Mitchell Hashimoto's AI adoption account](https://mitchellh.com/writing/my-ai-adoption-journey): turn observed mistakes into targeted guidance/tools; personal experience, not a universal guarantee.
- [Anthropic Agent Skills article](https://www.anthropic.com/research/equipping-agents-for-the-real-world-with-agent-skills): evaluate concrete gaps, disclose context progressively and audit executable resources.
- [Vercel React practices](https://vercel.com/blog/introducing-react-best-practices): prioritize measured performance problems. Next.js/RSC-specific recommendations are not automatically applicable to Bun and client React.
- [Vercel interface-review skill](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md): useful checklist reference, but its live upstream fetch is not a stable local policy.
- [Anthropic frontend-design reference](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md): deliberate choices and review against the actual brief, not a replacement for approved DESIGN.
- [Anthropic webapp-testing reference](https://github.com/anthropics/skills/blob/main/skills/webapp-testing/SKILL.md): do not adopt instructions to execute helpers before inspecting them or use network-idle as a universal readiness gate. [Playwright explicitly discourages that readiness test](https://playwright.dev/docs/api/class-page#page-wait-for-load-state).
- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security): future main/preload/renderer isolation, restricted navigation and validated IPC; no Electron installation occurs here.
- [ETH repository-context evaluation](https://www.sri.inf.ethz.ch/publications/gloaguen2026agentsmd): a reason to test whether added guidance helps rather than assume more instructions improve results; its benchmark is not a measurement of this project.

Neither catalog popularity nor vendor authorship replaces auditing and project-specific testing. A checklist review is not WCAG compliance, and a data-rich demo is not evidence that standard logs emit those fields.
