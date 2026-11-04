import type { FlowEvent } from "../../src/core/aggregate";
import { EMPTY_FILTERS, type FlowFilters } from "../filters";
import { ROLES } from "./format";

const distinct = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => v !== null))].sort();
const TIME: FlowFilters["timeRange"][] = ["5m", "1h", "24h"];
const TIME_LABEL = { all: "any time", "5m": "last 5 min", "1h": "last 1 h", "24h": "last 24 h" } as const;

export const isFiltered = (f: FlowFilters) => JSON.stringify(f) !== JSON.stringify(EMPTY_FILTERS);

function Select({
  id,
  label,
  all,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  /** Short text for the unfiltered choice; the full name stays in aria-label. */
  all: string;
  value: string;
  options: { value: string; label?: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select id={id} aria-label={label} title={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{all}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label ?? o.value}
        </option>
      ))}
    </select>
  );
}

export function FilterBar({
  events,
  filters,
  matched,
  onChange,
}: {
  events: FlowEvent[];
  filters: FlowFilters;
  matched: number;
  onChange: (next: FlowFilters) => void;
}) {
  const set = (patch: Partial<FlowFilters>) => onChange({ ...filters, ...patch });
  const roles = [
    ...ROLES,
    ...distinct(events.map((e) => e.suggestion)).filter((r) => !(ROLES as readonly string[]).includes(r)),
  ];
  const active = isFiltered(filters);
  const asOptions = (values: string[]) => values.map((value) => ({ value }));
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
      <Select
        id="flt-session"
        label="session"
        all="any session"
        value={filters.session}
        options={asOptions(distinct(events.map((e) => e.session)))}
        onChange={(session) => set({ session })}
      />
      <Select
        id="flt-role"
        label="role"
        all="any role"
        value={filters.role}
        options={asOptions(roles)}
        onChange={(role) => set({ role })}
      />
      <Select
        id="flt-agent"
        label="context agent"
        all="any ctx agent"
        value={filters.agent}
        options={asOptions(distinct(events.map((e) => e.contextAgent)))}
        onChange={(agent) => set({ agent })}
      />
      <Select
        id="flt-model"
        label="classifier model"
        all="any classifier"
        value={filters.model}
        options={asOptions(distinct(events.map((e) => e.classifierModel)))}
        onChange={(model) => set({ model })}
      />
      <Select
        id="flt-decision"
        label="decision"
        all="any decision"
        value={filters.decision}
        options={asOptions(distinct(["injected", "skipped", ...events.map((e) => e.decision)]))}
        onChange={(decision) => set({ decision })}
      />
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
