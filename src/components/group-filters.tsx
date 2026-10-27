"use client";

import type { GroupFilterState, GroupProgressFilter } from "@/lib/group-progress";

const PROGRESS_OPTIONS: { value: GroupProgressFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "nobody", label: "Nobody" },
  { value: "some", label: "Some" },
  { value: "everyone", label: "Everyone" },
];

interface GroupFiltersProps {
  value: GroupFilterState;
  onChange: (value: GroupFilterState) => void;
  /** "Some"/"Everyone" only differ from "Nobody"/"All" with 2+ players selected */
  groupSize: number;
}

export function GroupFilters({ value, onChange, groupSize }: GroupFiltersProps) {
  const options = groupSize > 1 ? PROGRESS_OPTIONS : PROGRESS_OPTIONS.filter((option) => option.value !== "some");
  const progressLabel = groupSize > 1 ? "Done by" : "Status";

  return (
    <>
      <div role="radiogroup" aria-label={progressLabel} className="flex shrink-0 rounded-xl border border-border bg-card p-0.5">
        {options.map((option) => {
          const active = value.progress === option.value;
          const label = groupSize > 1 ? option.label : { all: "All", nobody: "To do", some: "", everyone: "Done" }[option.value];
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
