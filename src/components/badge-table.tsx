"use client";

import Link from "next/link";
import React, { useState } from "react";
import type { SortCriterion } from "./multi-sort";

// ─── Column header ────────────────────────────────────────────────────────────

export interface ColumnHeader {
  label: string;
  /** Shown as a tooltip on the header cell */
  tooltip?: string;
  /** Defaults to "left". Applied to both the header label and every data cell in this column. */
  align?: "left" | "center" | "right";
  /** CSS grid track value, e.g. "minmax(0,1fr)", "5rem", "auto" */
  width: string;
  /** If set, clicking this column header will sort by this field via onSortChange */
  sortField?: string;
  /** When first selected via header click, sort descending rather than ascending */
  sortDefaultDescending?: boolean;
}

// ─── Row ──────────────────────────────────────────────────────────────────────

export interface BadgeTableRow {
  key: string;
  /**
   * Full Tailwind class string for the row background, e.g.
   * "bg-completed hover:bg-completed-hover" or "hover:bg-card-hover".
   * Caller owns the logic; component just applies it.
   */
  className?: string;
  /** If provided the row renders as a <Link>. Mutually exclusive with onMouseDown. */
  href?: string;
  /** If provided the row renders as a <div> with this handler (tap-to-select). */
  onMouseDown?: () => void;
  /** One ReactNode per column — positioned by the grid. */
  cells: React.ReactNode[];
  /** Rendered full-width below the row (e.g. meta rule blurbs). */
  footer?: React.ReactNode;
}

// ─── Section (for multi-group tables) ─────────────────────────────────────────

export interface BadgeTableSection {
  /** Optional label rendered as a full-width header above the section's rows. */
  label?: string;
  rows: BadgeTableRow[];
}

// ─── Table ────────────────────────────────────────────────────────────────────
//
// Uses CSS subgrid so the header and every data row share a single set of
// column tracks.  This means `auto` columns resolve based on the widest cell
// across ALL rows — no more per-row misalignment.
//
// Supports either a flat `rows` array or multiple `sections` (with optional
// section headings).  Both render inside the same grid so columns align
// across sections.

interface BadgeTableProps {
  columns: ColumnHeader[];
  /** Simple flat list of rows. Mutually exclusive with `sections`. */
  rows?: BadgeTableRow[];
  /** Grouped rows with optional section headings. Shares the same grid. */
  sections?: BadgeTableSection[];
  emptyState?: React.ReactNode;
  /** Current sort state. When provided together with onSortChange, column headers with sortField become clickable. */
  sortCriteria?: SortCriterion[];
  /** Called when user clicks a sortable column header. Parent owns sort state and row ordering. */
  onSortChange?: (criteria: SortCriterion[]) => void;
}

const SUBGRID_STYLE: React.CSSProperties = {
  gridColumn: "1 / -1",
  display: "grid",
  gridTemplateColumns: "subgrid",
};

const FULL_SPAN_STYLE: React.CSSProperties = { gridColumn: "1 / -1" };

export function BadgeTable({ columns, rows, sections, emptyState, sortCriteria, onSortChange }: BadgeTableProps) {
  const gridTemplateColumns = columns.map((column) => column.width).join(" ");

  const alignClass = (align: ColumnHeader["align"]) =>
    align === "center" ? "text-center" : align === "right" ? "text-right" : undefined;

  function handleHeaderSort(column: ColumnHeader) {
    if (!column.sortField || !onSortChange) return;
    const field = column.sortField;
    const currentCriteria = sortCriteria ?? [];
    const isPrimary = currentCriteria[0]?.field === field;
    const defaultAscending = !(column.sortDefaultDescending ?? false);

    if (!isPrimary) {
      // State 1: not primary → make primary with default direction, keep others
      const withoutField = currentCriteria.filter((c) => c.field !== field);
      onSortChange([{ field, ascending: defaultAscending }, ...withoutField]);
    } else {
      const currentAscending = currentCriteria[0].ascending;
      if (currentAscending === defaultAscending) {
        // State 2: primary at default direction → flip to opposite direction
        onSortChange(currentCriteria.map((c, i) => i === 0 ? { ...c, ascending: !currentAscending } : c));
      } else {
        // State 3: primary at opposite direction → remove entirely
        const withoutField = currentCriteria.filter((c) => c.field !== field);
        onSortChange(withoutField);
      }
    }
  }

  // Normalise to sections. If flat `rows` is provided, wrap it as a single section.
  const resolvedSections: BadgeTableSection[] = sections ?? (rows ? [{ rows }] : []);
  const totalRows = resolvedSections.reduce((sum, section) => sum + section.rows.length, 0);

  // Track which labeled sections are collapsed. Keyed by section index.
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(() => new Set());

  function toggleSection(index: number) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="grid" style={{ gridTemplateColumns }}>
        {/* Column header row */}
        <div
          className="grid items-start gap-2 border-b border-border bg-card px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted"
          style={SUBGRID_STYLE}
        >
          {columns.map((column, index) => {
            const isSortable = !!column.sortField && !!onSortChange;
            const isPrimary = isSortable && sortCriteria?.[0]?.field === column.sortField;
            const isAnyActive = isSortable && sortCriteria?.some((c) => c.field === column.sortField);
            const isAscending = sortCriteria?.find((c) => c.field === column.sortField)?.ascending;

            const baseHeaderClass = "whitespace-pre-line min-w-0 leading-tight";

            if (isSortable) {
              return (
                <button
                  key={index}
                  type="button"
                  title={column.tooltip}
                  onClick={() => handleHeaderSort(column)}
                  className={`${baseHeaderClass} hover:text-foreground transition-colors ${
                    column.align === "center" ? "text-center" : column.align === "right" ? "text-right" : "text-left"
                  } ${isAnyActive ? "text-foreground" : ""}`}
                >
                  {column.label}
                  {isPrimary && (
                    <span className="ml-0.5">{isAscending ? "↑" : "↓"}</span>
                  )}
                </button>
              );
            }

            return (
              <span key={index} title={column.tooltip} className={`${baseHeaderClass} ${alignClass(column.align) ?? ""}`}>
                {column.label}
              </span>
            );
          })}
        </div>

        {/* Sections */}
        {resolvedSections.map((section, sectionIndex) => {
          const isLastSection = sectionIndex === resolvedSections.length - 1;
          const isCollapsed = collapsedSections.has(sectionIndex);
          return (
            <React.Fragment key={sectionIndex}>
              {section.label && (
                <button
                  type="button"
                  onClick={() => toggleSection(sectionIndex)}
                  className="flex items-center gap-1.5 border-b border-border bg-card px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted hover:text-foreground transition-colors cursor-pointer"
                  style={FULL_SPAN_STYLE}
                >
                  <svg
                    className={`h-3 w-3 shrink-0 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                  {section.label}
                  <span className="font-normal text-muted">({section.rows.length})</span>
                </button>
              )}
              {!isCollapsed && section.rows.map((row, rowIndex) => {
                const isLastRowInSection = rowIndex === section.rows.length - 1;
                const isAbsolutelyLast = isLastSection && isLastRowInSection;
                return (
                  <RowWrapper
                    key={row.key}
                    row={row}
                    columns={columns}
                    isLastRow={isAbsolutelyLast}
                  />
                );
              })}
            </React.Fragment>
          );
        })}
      </div>

      {totalRows === 0 && emptyState}
    </div>
  );
}

// ─── Row wrapper — subgrid row (Link or div) ─────────────────────────────────

function RowWrapper({
  row,
  columns,
  isLastRow,
}: {
  row: BadgeTableRow;
  columns: ColumnHeader[];
  isLastRow: boolean;
}) {
  const needsBorder = row.footer || !isLastRow;
  const borderClass = needsBorder ? "border-b border-border" : "";
  const rowClassName = `grid items-center gap-2 px-3 py-2 transition-colors ${borderClass} ${row.className ?? "hover:bg-card-hover"}`;

  const innerCells = row.cells.map((cell, index) => {
    const align = columns[index]?.align;
    const justifyClass =
      align === "center" ? "flex items-center justify-center min-w-0" :
      align === "right"  ? "flex items-center justify-end min-w-0" :
                           "flex items-center min-w-0";
    return (
      <div key={index} className={justifyClass}>
        {cell}
      </div>
    );
  });

  const mainRow = row.href ? (
    <Link href={row.href} className={rowClassName} style={SUBGRID_STYLE}>
      {innerCells}
    </Link>
  ) : (
    <div
      className={`${rowClassName} ${row.onMouseDown ? "cursor-pointer select-none" : ""}`}
      style={SUBGRID_STYLE}
      onMouseDown={row.onMouseDown}
    >
      {innerCells}
    </div>
  );

  if (!row.footer) return mainRow;

  const footerBorderClass = isLastRow ? "" : "border-b border-border";
  return (
    <>
      {mainRow}
      <div className={footerBorderClass} style={FULL_SPAN_STYLE}>
        {row.footer}
      </div>
    </>
  );
}

// ─── BadgeCheckbox ────────────────────────────────────────────────────────────

interface BadgeCheckboxProps {
  checked: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  /** Wraps in a div that calls e.preventDefault() — prevents Link row navigation when clicking the checkbox */
  preventLinkNavigation?: boolean;
  /** Override Tailwind classes for the checked state (e.g. amber for "To Do") */
  checkedClassName?: string;
  /** When true (and disabled), show an × instead of a checkmark — used to signal "locked out" */
  crossWhenDisabled?: boolean;
}

export function BadgeCheckbox({
  checked,
  disabled,
  title,
  onClick,
  preventLinkNavigation,
  checkedClassName = "border-success bg-success/20 text-success hover:bg-success/30",
  crossWhenDisabled = false,
}: BadgeCheckboxProps) {
  const showCross = crossWhenDisabled && disabled;
  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-6 w-6 items-center justify-center rounded border transition-colors ${
        checked
          ? checkedClassName
          : "border-border bg-background text-transparent hover:border-muted hover:text-muted"
      } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
    >
      {showCross ? (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );

  if (preventLinkNavigation) {
    return (
      <div
        className="flex justify-center"
        onClick={(event) => event.preventDefault()}
      >
        {button}
      </div>
    );
  }

  return <div className="flex justify-center">{button}</div>;
}
