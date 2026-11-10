import type { FlowEvent } from "./aggregate";

/** Shown whenever a field is absent from the parsed record. Never filled in. */
export const UNKNOWN = "unknown";

export type EvidenceRow = { key: string; value: string; known: boolean };

export type SuggestionEvidence = {
  title: "Why this suggestion?";
  rows: EvidenceRow[];
  /** Observe `answers.role.probabilities`, sorted high to low; empty when absent. */
  probabilities: { role: string; probability: number }[];
};

const row = (key: string, value: string | number | null | undefined): EvidenceRow =>
  value === null || value === undefined
    ? { key, value: UNKNOWN, known: false }
    : { key, value: String(value), known: true };

/**
 * Evidence pane for one event. Reads only fields the schema already parses
 * (route: decision, reason, role, conf, needs_oracle; observe: answers.role.probabilities).
 * It never infers a rationale and never says which model executed.
 */
export function suggestionEvidence(event: Pick<FlowEvent, "route" | "observe">): SuggestionEvidence {
  const route = event.route;
  const probs = event.observe?.answers?.role.probabilities;
  return {
    title: "Why this suggestion?",
    rows: [
      row("decision", route?.decision),
      row("reason", route?.reason),
      row("role", route?.role),
      row("conf", route?.conf),
      row("needs_oracle", route?.needs_oracle),
    ],
    probabilities: probs
      ? Object.entries(probs)
          .map(([role, probability]) => ({ role, probability }))
          .sort((a, b) => b.probability - a.probability || a.role.localeCompare(b.role))
      : [],
  };
}
