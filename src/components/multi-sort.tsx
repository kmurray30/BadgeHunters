"use client";

import { useState, useRef, useEffect } from "react";
import { CustomSelect } from "./custom-select";

export interface SortField {
  value: string;
  label: string;
  /** Tooltip shown when hovering this option in the dropdown */
  tooltip?: string;
}

export interface SortCriterion {
  field: string;
  ascending: boolean;
}

interface MultiSortProps {
  availableFields: SortField[];
  criteria: SortCriterion[];
  onChange: (criteria: SortCriterion[]) => void;
}

/**
 * Dropdown widget for multi-level sorting. Shows a vertical list of active sort
 * criteria with direction toggles and remove buttons, plus an "Add sort" option.
 */
export function MultiSort({ availableFields, criteria, onChange }: MultiSortProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const usedFields = new Set(criteria.map((criterion) => criterion.field));
  const unusedFields = availableFields.filter((field) => !usedFields.has(field.value));

  function addCriterion(fieldValue: string) {
    onChange([...criteria, { field: fieldValue, ascending: true }]);
  }

  function removeCriterion(index: number) {
    const updated = criteria.filter((_, idx) => idx !== index);
    onChange(updated.length > 0 ? updated : [{ field: availableFields[0].value, ascending: true }]);
  }

  function toggleDirection(index: number) {
    const updated = criteria.map((criterion, idx) =>
      idx === index ? { ...criterion, ascending: !criterion.ascending } : criterion
    );
    onChange(updated);
  }

  function changeField(index: number, newField: string) {
    const updated = criteria.map((criterion, idx) =>
      idx === index ? { ...criterion, field: newField } : criterion
    );
    onChange(updated);
  }

  function moveUp(index: number) {
    if (index === 0) return;
    const updated = [...criteria];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    onChange(updated);
  }

  const summaryLabel = criteria
    .map((criterion) => {
      const fieldDef = availableFields.find((field) => field.value === criterion.field);
      return `${fieldDef?.label ?? criterion.field} ${criterion.ascending ? "↑" : "↓"}`;
    })
    .join(", ");

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:border-muted transition-colors"
      >
        <svg className="h-3 w-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9M3 12h5m4 0l4 4m0 0l4-4m-4 4V4" />
        </svg>
        <span className="max-w-[14rem] truncate">{summaryLabel || "Sort"}</span>
        <svg className={`h-3 w-3 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-border bg-card p-2 shadow-lg">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">Sort by</p>

          <div className="space-y-1">
            {criteria.map((criterion, index) => {
              const fieldDef = availableFields.find((field) => field.value === criterion.field);
              const swappableFields = [
                fieldDef!,
                ...unusedFields,
              ];

              return (
                <div key={index} className="flex items-center gap-1">
                  {/* Priority indicator / reorder */}
                  {index > 0 && (
                    <button type="button" onClick={() => moveUp(index)} className="p-0.5 text-muted hover:text-foreground" title="Move up">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                  )}
                  {index === 0 && <span className="w-4" />}

                  {/* Field selector */}
                  <CustomSelect
                    options={swappableFields}
                    value={criterion.field}
                    onChange={(newField) => changeField(index, newField)}
                    compact
                    className="min-w-0 flex-1"
                  />

                  {/* Direction toggle */}
                  <button
                    type="button"
                    onClick={() => toggleDirection(index)}
                    className="rounded border border-border bg-background px-1.5 py-1 text-xs text-muted hover:text-foreground transition-colors"
                    title={criterion.ascending ? "Ascending" : "Descending"}
                  >
                    {criterion.ascending ? "↑" : "↓"}
                  </button>

                  {/* Remove */}
                  {criteria.length > 1 && (
                    <button type="button" onClick={() => removeCriterion(index)} className="p-0.5 text-muted hover:text-danger transition-colors" title="Remove">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {unusedFields.length > 0 && (
            <button
              type="button"
              onClick={() => addCriterion(unusedFields[0].value)}
              className="mt-2 inline-flex items-center gap-1 text-[10px] text-accent hover:text-accent-hover transition-colors"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add sort level
            </button>
          )}
        </div>
      )}
    </div>
  );
}
