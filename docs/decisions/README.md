# Product and architecture decisions

Record durable decisions and their consequences here, not every brainstorming idea. Link supporting proposals rather than copying their full bodies. A decision record can select a direction without approving installation, implementation, access, or a release.

| Record | Status | Meaning |
| --- | --- | --- |
| [0001: Desktop direction](0001-desktop-direction.md) | Direction selected; implementation under evaluation | Electron is the selected shell direction; service/CLI boundaries and platform validation still require scoped work |
| [0002: Session-linked external evidence](0002-session-linked-external-evidence.md) | Research contract approved as docs only; no integration | Manual session↔PR↔exact-head-SHA association, evidence states, human-approval rule and future authorization decisions; no collector, scopes or UI |

When adding a record, state context, decision, alternatives, consequences, open questions, authorization boundaries and verification needs. If superseded, preserve the old rationale and link the replacement instead of silently changing history. The [roadmap](../ROADMAP.md) is the navigation entry point; [project Decision fields](../REPOSITORY.md) govern issue approval separately.
