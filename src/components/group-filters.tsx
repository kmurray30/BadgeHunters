"use client";

import type { GroupFilterState, GroupProgressFilter } from "@/lib/group-progress";

// Labels for a group, and for when only you are selected.
const PROGRESS_OPTIONS: { value: GroupProgressFilter; label: string; soloLabel: string }[] = [
  { value: "all", label: "Show all", soloLabel: "Show all" },
  { value: "nobody", label: "Nobody's done", soloLabel: "To do" },
  { value: "some", label: "Some done", soloLabel: "" },
  { value: "everyone", label: "All done", soloLabel: "Done" },
];

interface GroupFiltersProps {
  value: GroupFilterState;
  onChange: (value: GroupFilterState) => void;
  /** "Some"/"Everyone" only differ from "Nobody"/"All" with 2+ players selected */
  groupSize: number;
}

export function GroupFilters({ value, onChange, groupSize }: GroupFiltersProps) {
  const options = groupSize > 1 ? PROGRESS_OPTIONS : PROGRESS_OPTIONS.filter((option) => option.value !== "some");
  const progressLabel = groupSize > 1 ? "Done by the selected players" : "Status";

  return (
    <>
      <div role="radiogroup" aria-label={progressLabel} className="flex shrink-0 rounded-xl border border-border bg-card p-0.5">
        {options.map((option) => {
          const active = value.progress === option.value;
          const label = groupSize > 1 ? option.label : option.soloLabel;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange({ ...value, progress: option.value })}
              className={`rounded-[10px] px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
                active ? "bg-accent text-white shadow-[0_0_14px_rgba(255,62,165,0.45)]" : "text-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {groupSize > 1 && (
        <button
          type="button"
          aria-pressed={value.notDoneByMe}
          onClick={() => onChange({ ...value, notDoneByMe: !value.notDoneByMe })}
          className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-wide transition ${
            value.notDoneByMe
              ? "border-highlight bg-highlight/15 text-highlight"
              : "border-border text-muted hover:text-foreground"
          }`}
        >
          Not done by me
        </button>
      )}
    </>
  );
}
