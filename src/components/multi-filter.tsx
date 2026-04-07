"use client";

import { useState } from "react";

export interface FilterDefinition {
  /** Unique key for this filter dimension */
  key: string;
  /** Display label shown in the UI */
  label: string;
  /** Available options (value + label). First option is usually the "all" / inactive state. */
  options: { value: string; label: string }[];
  /** The value that means "no filter applied" (usually "all") */
  inactiveValue?: string;
}

export interface ActiveFilter {
  key: string;
  value: string;
}

interface MultiFilterProps {
  definitions: FilterDefinition[];
  activeFilters: ActiveFilter[];
  onChange: (filters: ActiveFilter[]) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
}

/**
 * Collapsible inline filter bar. Expanded: individual styled selects in a row.
 * Collapsed: compact summary of active filters only.
 */
export function MultiFilter({ definitions, activeFilters, onChange, searchValue, onSearchChange, searchPlaceholder }: MultiFilterProps) {
  const [expanded, setExpanded] = useState(false);

  function getFilterValue(key: string): string {
    return activeFilters.find((filter) => filter.key === key)?.value
      ?? definitions.find((def) => def.key === key)?.inactiveValue
      ?? "all";
  }

  function setFilterValue(key: string, value: string) {
    const definition = definitions.find((def) => def.key === key);
    const inactiveValue = definition?.inactiveValue ?? "all";

    if (value === inactiveValue) {
      onChange(activeFilters.filter((filter) => filter.key !== key));
    } else {
      const existing = activeFilters.find((filter) => filter.key === key);
      if (existing) {
        onChange(activeFilters.map((filter) => filter.key === key ? { key, value } : filter));
      } else {
        onChange([...activeFilters, { key, value }]);
      }
    }
  }

  const activeSummaryParts: string[] = [];
  for (const filter of activeFilters) {
    const definition = definitions.find((def) => def.key === filter.key);
    const selectedOption = definition?.options.find((option) => option.value === filter.value);
    if (definition && selectedOption) {
      activeSummaryParts.push(`${definition.label}: ${selectedOption.label}`);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search — always visible */}
      {onSearchChange && (
        <input
          type="text"
          value={searchValue ?? ""}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder ?? "Search..."}
          className="w-48 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
      )}

      {/* Filter toggle + expandable box */}
      <div className={`inline-flex flex-wrap items-center gap-2 rounded-lg p-1.5 ${expanded ? "outline outline-1 outline-border bg-card" : ""}`}>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs text-foreground transition-colors ${
            expanded ? "border-transparent" : "border-border hover:border-muted"
          }`}
        >
          <svg className="h-3 w-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          {expanded ? "Filters" : (
            activeSummaryParts.length > 0
              ? <span className="max-w-[20rem] truncate text-accent">{activeSummaryParts.join("  ·  ")}</span>
              : "Filters"
          )}
          <svg className={`h-3 w-3 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expanded && (
          <>
            {definitions.map((definition) => (
              <select
                key={definition.key}
                value={getFilterValue(definition.key)}
                onChange={(event) => setFilterValue(definition.key, event.target.value)}
                className={`rounded-md border bg-background px-2.5 py-1.5 text-xs focus:border-accent focus:outline-none transition-colors ${
                  getFilterValue(definition.key) !== (definition.inactiveValue ?? "all")
                    ? "border-accent/50 text-accent"
                    : "border-border text-foreground"
                }`}
              >
                {definition.options.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            ))}
            {activeFilters.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="px-1 text-[10px] text-danger hover:text-danger/80 transition-colors"
              >
                Clear
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
