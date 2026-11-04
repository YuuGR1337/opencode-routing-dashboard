# opencode-routing-dashboard

A real-time, localhost-only dashboard that shows how [OpenCode](https://opencode.ai) routes your work:
which role a classifier (e.g. Jev) suggested, which agent actually ran, which model and fallback
answered, what it cost, and where it failed.

## Why

Multi-agent setups such as [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim)
spread work across roles (orchestrator, oracle, fixer, explorer, designer) and providers with
fallback chains. Without a view of what really happened, you can't tell whether a preset is good,
whether quota is burned in the wrong place, or whether the router agrees with the orchestrator.

## Status

Scaffold only. See [docs/PLAN.md](docs/PLAN.md) for milestones and [docs/SPEC.md](docs/SPEC.md).

## Planned usage

```sh
bunx opencode-routing-dashboard            # or: bun run start
# open http://127.0.0.1:4777
```

Configuration (env or `--flag`): `ORD_STATE_DIR` (default `~/.local/state/opencode`),
`ORD_PORT` (default `4777`), `ORD_STATS_INTERVAL` (seconds, default `60`),
`ORD_SNAPSHOT_DIR` (weekly `opencode stats --json` snapshots).

Optional systemd user service: `contrib/opencode-routing-dashboard.service` (milestone M5).

## License

MIT
