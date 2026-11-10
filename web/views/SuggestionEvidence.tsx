import type { FlowEvent } from "../../src/core/aggregate";
import { suggestionEvidence, UNKNOWN } from "../../src/core/suggestion-evidence";

/** Read-only "Why this suggestion?" pane. Talks about the recorded suggestion, never the executing model. */
export function SuggestionEvidence({ event }: { event: Pick<FlowEvent, "route" | "observe"> }) {
  const ev = suggestionEvidence(event);
  return (
    <section data-pane="suggestion-evidence" aria-label={ev.title}>
      <h3>{ev.title}</h3>
      <p className="dim">Recorded by the router for this event. Fields the log does not carry show as {UNKNOWN}.</p>
      <table className="kv">
        <tbody>
          {ev.rows.map((r) => (
            <tr key={r.key}>
              <th>{r.key}</th>
              <td className={r.known ? undefined : "unavail"} data-unknown={r.known ? undefined : "true"}>
                {r.value}
              </td>
            </tr>
          ))}
          <tr>
            <th>role probabilities</th>
            <td className={ev.probabilities.length ? undefined : "unavail"}>
              {ev.probabilities.length
                ? ev.probabilities.map((p) => `${p.role} ${p.probability.toFixed(2)}`).join(" · ")
                : UNKNOWN}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
