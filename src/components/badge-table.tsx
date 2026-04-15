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
  /** If true, the header label is rendered at a steep angle (~75°). */
  vertical?: boolean;
  /** If true, the header label is rendered with bold weight. */
  bold?: boolean;
  /** Group name — columns sharing the same group get a spanning header label above them. */
  group?: string;
  /**
   * Controls horizontal scroll pinning.
   * - true / "frozen": column is pinned and always on top (z-30)
   * - "behind": column is pinned but non-sticky columns scroll over it (z-10)
   * Sticky columns should use fixed widths for accurate left-offset calculation.
   */
  sticky?: boolean | "behind";
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
  /** If true, the section starts collapsed. */
  defaultCollapsed?: boolean;
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

/**
 * Returns a map from column index → group label for the first column of
 * each group. Used to render spanning group labels inline within the
 * header row (only on the first column of each group).
 */
function buildGroupSpans(columns: ColumnHeader[]): Map<number, string> {
  const spans = new Map<number, string>();
  let lastGroup: string | undefined;
  for (let columnIdx = 0; columnIdx < columns.length; columnIdx++) {
    const group = columns[columnIdx].group;
    if (group && group !== lastGroup) {
      spans.set(columnIdx, group);
    }
    lastGroup = group;
  }
  return spans;
}

/**
 * Precompute sticky metadata for each pinned column.
 *
 * Z-index layering:
 *   - sticky (true / "frozen"): z-30  — always on top, never covered
 *   - sticky "behind":          z-10  — pinned but non-sticky columns cover it
 *   - non-sticky:               z-20  — scrolls normally, covers "behind" cols
 */
interface StickyMeta { left: string; zIndex: number }

// Must match the row's horizontal padding (px-3 = 0.75rem) so sticky
// left offsets align with the cells' natural grid positions.
const ROW_PADDING_LEFT = "0.75rem";

function buildStickyMeta(columns: ColumnHeader[]): Map<number, StickyMeta> {
  const result = new Map<number, StickyMeta>();
  const cumulativeParts: string[] = [ROW_PADDING_LEFT];
  for (let columnIdx = 0; columnIdx < columns.length; columnIdx++) {
    const stickyValue = columns[columnIdx].sticky;
    if (!stickyValue) continue;
    const leftValue = `calc(${cumulativeParts.join(" + ")})`;
    result.set(columnIdx, {
      left: leftValue,
      zIndex: stickyValue === "behind" ? 10 : 30,
    });
    cumulativeParts.push(columns[columnIdx].width, "0.5rem");
  }
  return result;
}

export function BadgeTable({ columns, rows, sections, emptyState, sortCriteria, onSortChange }: BadgeTableProps) {
  const gridTemplateColumns = columns.map((column) => column.width).join(" ");
  const hasStickyCols = columns.some((column) => column.sticky);
  const stickyMeta = hasStickyCols ? buildStickyMeta(columns) : new Map<number, StickyMeta>();

  const alignClass = (align: ColumnHeader["align"]) =>
    align === "center" ? "text-center" : align === "right" ? "text-right" : undefined;

  function handleHeaderSort(column: ColumnHeader) {
    if (!column.sortField || !onSortChange) return;
    const field = column.sortField;
    const currentCriteria = sortCriteria ?? [];
    const isPrimary = currentCriteria[0]?.field === field;
    const defaultAscending = !(column.sortDefaultDescending ?? false);

    if (!isPrimary) {
      const withoutField = currentCriteria.filter((c) => c.field !== field);
      onSortChange([{ field, ascending: defaultAscending }, ...withoutField]);
    } else {
      const currentAscending = currentCriteria[0].ascending;
      if (currentAscending === defaultAscending) {
        onSortChange(currentCriteria.map((c, i) => i === 0 ? { ...c, ascending: !currentAscending } : c));
      } else {
        const withoutField = currentCriteria.filter((c) => c.field !== field);
        onSortChange(withoutField);
      }
    }
  }

  const resolvedSections: BadgeTableSection[] = sections ?? (rows ? [{ rows }] : []);
  const totalRows = resolvedSections.reduce((sum, section) => sum + section.rows.length, 0);

  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    for (let sectionIdx = 0; sectionIdx < resolvedSections.length; sectionIdx++) {
      if (resolvedSections[sectionIdx].defaultCollapsed) initial.add(sectionIdx);
    }
    return initial;
  });

  function toggleSection(index: number) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function headerCellStyle(columnIndex: number): React.CSSProperties | undefined {
    if (!hasStickyCols) return undefined;
    const meta = stickyMeta.get(columnIndex);
    if (meta) {
      return { position: "sticky", left: meta.left, zIndex: meta.zIndex, backgroundColor: "var(--card)" };
    }
    // Non-sticky header cells need z-20 so they cover "behind" sticky columns
    return { position: "relative", zIndex: 20, backgroundColor: "var(--card)" };
  }

  return (
    <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-border">
      <div
        className="grid"
        style={{ gridTemplateColumns, minWidth: hasStickyCols ? "max-content" : undefined }}
      >
        {/* Column header row */}
        <div
          className="grid items-center gap-2 border-b border-border bg-card px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted"
          style={SUBGRID_STYLE}
        >
          {columns.map((column, index) => {
              const isSortable = !!column.sortField && !!onSortChange;
              const isPrimary = isSortable && sortCriteria?.[0]?.field === column.sortField;
              const isAnyActive = isSortable && sortCriteria?.some((c) => c.field === column.sortField);
              const isAscending = sortCriteria?.find((c) => c.field === column.sortField)?.ascending;
              const cellStyle = headerCellStyle(index);

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
                    style={cellStyle}
                  >
                    {column.label}
                    {isPrimary && (
                      <span className="ml-0.5">{isAscending ? "↑" : "↓"}</span>
                    )}
                  </button>
                );
              }

              if (column.vertical) {
                return (
                  <span
                    key={index}
                    title={column.tooltip ?? column.label}
                    className={`self-end text-center normal-case tracking-normal text-[11px] ${column.bold ? "font-bold text-foreground" : ""}`}
                    style={{
                      writingMode: "vertical-rl",
                      transform: "rotate(195deg) translateX(-7px)",
                      maxHeight: "4rem",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      textTransform: "none",
                      ...cellStyle,
                    }}
                  >
                    {column.label}
                  </span>
                );
              }

              return (
                <span key={index} title={column.tooltip} className={`${baseHeaderClass} ${alignClass(column.align) ?? ""}`} style={cellStyle}>
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
                    stickyMeta={stickyMeta}
                    hasStickyCols={hasStickyCols}
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
  stickyMeta,
  hasStickyCols,
  isLastRow,
}: {
  row: BadgeTableRow;
  columns: ColumnHeader[];
  stickyMeta: Map<number, StickyMeta>;
  hasStickyCols: boolean;
  isLastRow: boolean;
}) {
  const needsBorder = row.footer || !isLastRow;
  const borderClass = needsBorder ? "border-b border-border" : "";
  const rowClassName = `grid gap-2 px-3 py-2 transition-colors ${borderClass} ${row.className ?? "hover:bg-card-hover"}`;

  const innerCells = row.cells.map((cell, index) => {
    const align = columns[index]?.align;
    const meta = stickyMeta.get(index);
    const justifyClass =
      align === "center" ? "flex items-center justify-center min-w-0" :
      align === "right"  ? "flex items-center justify-end min-w-0" :
                           "flex items-center min-w-0";

    let cellStyle: React.CSSProperties | undefined;
    if (!hasStickyCols) {
      cellStyle = undefined;
    } else if (meta) {
      // --cell-bg is set by the row's Tailwind class (see globals.css) so
      // sticky cells pick up the correct opaque tint for completed/selection rows.
      cellStyle = { position: "sticky", left: meta.left, zIndex: meta.zIndex, backgroundColor: "var(--cell-bg)" };
    } else {
      // Non-sticky cells at z-20 cover "behind" sticky columns when scrolling
      cellStyle = { position: "relative", zIndex: 20, backgroundColor: "var(--cell-bg)" };
    }
    return (
      <div key={index} className={justifyClass} style={cellStyle}>
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
  /** Render a star icon instead of a checkmark (hollow when unchecked, filled when checked) */
  useStar?: boolean;
}

export function BadgeCheckbox({
  checked,
  disabled,
  title,
  onClick,
  preventLinkNavigation,
  checkedClassName = "border-success bg-success/20 text-success hover:bg-success/30",
  crossWhenDisabled = false,
  useStar = false,
}: BadgeCheckboxProps) {
  const showCross = crossWhenDisabled && disabled;

  if (useStar) {
    const starButton = (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={`flex h-6 w-6 items-center justify-center transition-colors ${
          disabled ? "cursor-not-allowed opacity-40" : "hover:opacity-80"
        }`}
      >
        <svg className="h-5 w-5 text-foreground" viewBox="0 0 24 24" fill={checked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
        </svg>
      </button>
    );
    if (preventLinkNavigation) {
      return <div className="flex justify-center" onClick={(event) => event.preventDefault()}>{starButton}</div>;
    }
    return <div className="flex justify-center">{starButton}</div>;
  }

  function renderIcon() {
    if (showCross) {
      return (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
    }
    return (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }

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
      {renderIcon()}
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
