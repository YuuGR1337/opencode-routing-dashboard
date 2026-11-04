import type { FlowEvent } from "../../src/core/aggregate";
import { EMPTY_FILTERS, type FlowFilters } from "../filters";
import { currentOptions, type OptionField, type OptionMemory, optionList } from "../selection";
import { fmtSession, ROLES } from "./format";

const TIME: FlowFilters["timeRange"][] = ["5m", "1h", "24h"];
const TIME_LABEL = { all: "any time", "5m": "last 5 min", "1h": "last 1 h", "24h": "last 24 h" } as const;

export const isFiltered = (f: FlowFilters) => JSON.stringify(f) !== JSON.stringify(EMPTY_FILTERS);

type Spec = {
  id: string;
  field: OptionField;
  key: keyof FlowFilters;
  label: string;
  all: string;
  base?: readonly string[];
  /** Only offered when events carry the evidence (or the filter is already set). */
  evidence?: boolean;
};
const SPECS: Spec[] = [
  { id: "flt-source", field: "source", key: "source", label: "source", all: "any source", evidence: true },
  { id: "flt-client", field: "client", key: "client", label: "client", all: "any client", evidence: true },
  { id: "flt-session", field: "session", key: "session", label: "session", all: "any session" },
  { id: "flt-role", field: "role", key: "role", label: "role", all: "any role", base: ROLES },
  { id: "flt-agent", field: "agent", key: "agent", label: "context agent", all: "any ctx agent" },
  { id: "flt-model", field: "model", key: "model", label: "classifier model", all: "any classifier" },
  {
    id: "flt-decision",
    field: "decision",
    key: "decision",
    label: "decision",
    all: "any decision",
    base: ["injected", "skipped"],
  },
];

function Select({
  spec,
  value,
  items,
  onChange,
}: {
  spec: Spec;
  value: string;
  items: ReturnType<typeof optionList>;
  onChange: (value: string) => void;
}) {
  return (
    <select
      id={spec.id}
      aria-label={spec.label}
      title={spec.label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{spec.all}</option>
      {items.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function FilterBar({
  events,
  filters,
  matched,
  known,
  onChange,
}: {
  events: FlowEvent[];
  filters: FlowFilters;
  matched: number;
  /** Every option seen since the filters were last clear, so values that left the window stay selectable. */
  known?: OptionMemory;
  onChange: (next: FlowFilters) => void;
}) {
  const set = (patch: Partial<FlowFilters>) => onChange({ ...filters, ...patch });
  const active = isFiltered(filters);
  const now = currentOptions(events);
  const lists = SPECS.map((spec) => {
    const value = filters[spec.key] as string;
    return {
      spec,
      value,
      items: optionList(
        known?.[spec.field] ?? [],
        now[spec.field],
        value,
        spec.base,
        spec.field === "session" ? fmtSession : undefined,
      ),
    };
  });
  const orphaned = lists.reduce(
    (n, l) => n + (l.value && l.items.some((i) => i.value === l.value && i.gone) ? 1 : 0),
    0,
  );
  return (
    <div className="filters" role="search">
      <input
        id="flt-search"
        type="search"
        aria-label="search"
        placeholder="search ( / )"
        value={filters.query}
        onChange={(e) => set({ query: e.target.value })}
      />
      <select
        id="flt-time"
        aria-label="time range"
        title="time range"
        value={filters.timeRange}
        onChange={(e) => set({ timeRange: e.target.value as FlowFilters["timeRange"] })}
      >
        <option value="all">{TIME_LABEL.all}</option>
        {TIME.map((t) => (
          <option key={t} value={t}>
            {TIME_LABEL[t]}
          </option>
        ))}
      </select>
      {lists
        .filter((l) => !l.spec.evidence || l.items.length > 0 || l.value)
        .map((l) => (
          <Select
            key={l.spec.id}
            spec={l.spec}
            value={l.value}
            items={l.items}
            onChange={(value) => set({ [l.spec.key]: value } as Partial<FlowFilters>)}
          />
        ))}
      <label className="check">
        <input
          type="checkbox"
          aria-label="errors only"
          checked={filters.errorsOnly}
          onChange={(e) => set({ errorsOnly: e.target.checked })}
        />
        errors only
      </label>
      <button type="button" aria-label="clear filters" disabled={!active} onClick={() => onChange(EMPTY_FILTERS)}>
        clear
      </button>
      {orphaned > 0 ? (
        <span className="orphan" role="status" data-orphaned={orphaned}>
          {`${orphaned} filter value${orphaned === 1 ? "" : "s"} not in window`}
        </span>
      ) : null}
      <span
        className={`scope${active ? " on" : ""}`}
        role="status"
        title="execution fields are not recorded, so there is no execution filter"
      >
        {active ? `filtered: ${matched} of ${events.length} sent` : `${matched} of ${events.length} sent`}
      </span>
    </div>
  );
}
