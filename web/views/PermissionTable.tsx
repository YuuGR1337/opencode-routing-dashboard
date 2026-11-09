import type { PermissionRecord } from "../../src/core/schema";
import { fmt2, fmtTs } from "./format";

/**
 * Permission-gate verdicts exactly as recorded. Shared by the Errors drawer and the Sessions inspector so both
 * show the same fields and handling: ● allow / ◆ other (glyph plus word), `—` for absent scores, commands as recorded.
 * A verdict is the gate's output, not an approval event.
 */
export function PermissionTable({
  permissions,
  session = true,
}: {
  permissions: PermissionRecord[];
  session?: boolean;
}) {
  return (
    <table className="list">
      <thead>
        <tr>
          <th>ts</th>
          {session ? <th>session</th> : null}
          <th>verdict</th>
          <th>commands</th>
          <th className="num">reversible</th>
          <th className="num">routine</th>
          <th className="num">latency</th>
        </tr>
      </thead>
      <tbody>
        {permissions.map((p, i) => (
          <tr key={`${p.ts}:${p.session}:${i}`}>
            <td>{fmtTs(p.ts)}</td>
            {session ? <td title={p.session}>{p.session}</td> : null}
            <td className={p.verdict.startsWith("allow") ? "ok" : "warn"}>
              <span className="glyph" aria-hidden="true">
                {p.verdict.startsWith("allow") ? "●" : "◆"}
              </span>
              {p.verdict}
            </td>
            <td className="cmd" title={p.commands.join(" ; ")}>
              {p.commands.join(" ; ")}
            </td>
            <td className="num">{p.scores ? fmt2(p.scores.reversible) : "—"}</td>
            <td className="num">{p.scores ? fmt2(p.scores.routine) : "—"}</td>
            <td className="num">{`${p.latency_ms}ms`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
