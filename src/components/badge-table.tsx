"use client";

import Link from "next/link";
import React, { useState } from "react";
import type { SortCriterion } from "./multi-sort";
import { usePersistedState } from "@/hooks/use-persisted-state";

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
  /** If true, this column is pinned to the left edge when the user enables column pinning. */
  sticky?: boolean;
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

// ─── Sticky helpers ──────────────────────────────────────────────────────────
//
// When pinning is active we use column-gap: 0 and bake the gap into each
// track width so there are no transparent cracks between cells.  Sticky cells
// get position: sticky + left + z-index. Non-sticky cells also use
// position: sticky (without left) so that z-index resolves consistently across
// mobile WebKit/Blink compositing layers.

const GAP = "0.5rem";
const ROW_PX = "0.75rem"; // matches px-3 on header & rows

interface StickyMeta {
  left: string;
  zIndex: number;
}

/** Add half-gap to each side of a track width string (absorbs column-gap: 0). */
function inflateTrackWidths(columns: ColumnHeader[]): string[] {
  return columns.map((column, index) => {
    const isFirst = index === 0;
    const isLast = index === columns.length - 1;
    const leftExtra = isFirst ? ROW_PX : `calc(${GAP} / 2)`;
    const rightExtra = isLast ? ROW_PX : `calc(${GAP} / 2)`;
    return addSizeToTrack(addSizeToTrack(column.width, leftExtra), rightExtra);
  });
}

/** Wrap raw track value so it grows by `extra`. Handles minmax() & plain values. */
function addSizeToTrack(track: string, extra: string): string {
  const minmaxMatch = track.match(/^minmax\((.+),\s*(.+)\)$/);
  if (minmaxMatch) {
    return `minmax(calc(${minmaxMatch[1]} + ${extra}), calc(${minmaxMatch[2]} + ${extra}))`;
  }
  if (track === "auto" || track === "max-content" || track === "min-content") {
    return track;
  }
  return `calc(${track} + ${extra})`;
}

/** Compute left offset and z-index for each sticky column. */
function buildStickyMeta(columns: ColumnHeader[], inflatedWidths: string[]): (StickyMeta | null)[] {
  const metas: (StickyMeta | null)[] = [];
  const parts: string[] = [];

  for (let index = 0; index < columns.length; index++) {
    if (columns[index].sticky) {
      const left = parts.length === 0 ? "0px" : `calc(${parts.join(" + ")})`;
      metas.push({ left, zIndex: 30 });
      parts.push(inflatedWidths[index]);
    } else {
      metas.push(null);
    }
  }
  return metas;
}

/** Return inline padding for a cell in inflated-width mode. */
function cellPaddingForSticky(index: number, totalColumns: number): React.CSSProperties {
  const isFirst = index === 0;
  const isLast = index === totalColumns - 1;
  return {
    paddingLeft: isFirst ? ROW_PX : `calc(${GAP} / 2)`,
    paddingRight: isLast ? ROW_PX : `calc(${GAP} / 2)`,
  };
}

// ─── Table ────────────────────────────────────────────────────────────────────

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
  const hasPinnableColumns = columns.some((column) => column.sticky);
  const [pinned, setPinned] = usePersistedState("bh:table:pinColumns", true);
  const isPinned = hasPinnableColumns && pinned;

  // Inflated widths & sticky metadata (only computed when pinned)
  const inflatedWidths = isPinned ? inflateTrackWidths(columns) : null;
  const stickyMeta = isPinned && inflatedWidths ? buildStickyMeta(columns, inflatedWidths) : null;

  const gridTemplateColumns = isPinned && inflatedWidths
    ? inflatedWidths.join(" ")
    : columns.map((column) => column.width).join(" ");

  const stickySubgridStyle: React.CSSProperties | undefined = isPinned
    ? { ...SUBGRID_STYLE, columnGap: 0, paddingLeft: 0, paddingRight: 0, isolation: "isolate", zIndex: 0 }
    : undefined;

  const alignClass = (align: ColumnHeader["align"]) =>
    align === "center" ? "text-center" : align === "right" ? "text-right" : undefined;

  function headerCellStyle(index: number): React.CSSProperties | undefined {
    if (!isPinned || !stickyMeta) return undefined;
    const meta = stickyMeta[index];
    const padding = cellPaddingForSticky(index, columns.length);
    if (meta) {
      return { position: "sticky", left: meta.left, zIndex: meta.zIndex, backgroundColor: "var(--card)", ...padding };
    }
    // Non-sticky cells also use position: sticky (without left) for consistent z-index
    return { position: "sticky", zIndex: 20, backgroundColor: "var(--card)", ...padding };
  }

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

  const pinToggle = hasPinnableColumns ? (
    <button
      type="button"
      onClick={(event) => { event.stopPropagation(); setPinned((prev) => !prev); }}
      title={pinned ? "Unpin # and Name columns" : "Pin # and Name columns to the left"}
      className="ml-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted hover:text-foreground transition-colors"
    >
      {pinned ? (
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      ) : (
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      )}
    </button>
  ) : null;

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

  // Find the index of the last sticky column (where we'll show the pin toggle)
  const lastStickyIndex = hasPinnableColumns
    ? columns.reduce((last, column, index) => column.sticky ? index : last, -1)
    : -1;

  return (
    <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-border">
      <div
        className="grid"
        style={{ gridTemplateColumns, minWidth: "max-content" }}
      >
        {/* Column header row */}
        <div
          className={`grid items-center border-b border-border bg-card py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted ${isPinned ? "" : "gap-2 px-3"}`}
          style={isPinned ? { ...SUBGRID_STYLE, columnGap: 0, paddingLeft: 0, paddingRight: 0 } : SUBGRID_STYLE}
        >
          {columns.map((column, index) => {
              const isSortable = !!column.sortField && !!onSortChange;
              const isPrimary = isSortable && sortCriteria?.[0]?.field === column.sortField;
              const isAnyActive = isSortable && sortCriteria?.some((c) => c.field === column.sortField);
              const isAscending = sortCriteria?.find((c) => c.field === column.sortField)?.ascending;

              const baseHeaderClass = "whitespace-pre-line min-w-0 leading-tight";
              const cellStyle = headerCellStyle(index);

              const showPinToggle = index === lastStickyIndex;

              if (isSortable) {
                return (
                  <div key={index} className="flex items-center min-w-0" style={cellStyle}>
                    <button
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
                    {showPinToggle && pinToggle}
                  </div>
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

              if (showPinToggle) {
                return (
                  <div key={index} className="flex items-center min-w-0" style={cellStyle}>
                    <span title={column.tooltip} className={`${baseHeaderClass} ${alignClass(column.align) ?? ""}`}>
                      {column.label}
                    </span>
                    {pinToggle}
                  </div>
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
                <div className="border-b border-border bg-card" style={FULL_SPAN_STYLE}>
                  <button
                    type="button"
                    onClick={() => toggleSection(sectionIndex)}
                    className="flex items-center gap-1.5 bg-card px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted hover:text-foreground transition-colors cursor-pointer"
                    style={{ position: "sticky", left: 0, width: "max-content" }}
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
                </div>
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
                    stickyMeta={stickyMeta}
                    subgridStyle={stickySubgridStyle}
                    isPinned={isPinned}
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
  stickyMeta,
  subgridStyle,
  isPinned,
}: {
  row: BadgeTableRow;
  columns: ColumnHeader[];
  isLastRow: boolean;
  stickyMeta: (StickyMeta | null)[] | null;
  subgridStyle: React.CSSProperties | undefined;
  isPinned: boolean;
}) {
  const needsBorder = row.footer || !isLastRow;
  const borderClass = needsBorder ? "border-b border-border" : "";
  const rowClassName = `grid py-2 transition-colors ${borderClass} ${row.className ?? "hover:bg-card-hover"} ${isPinned ? "" : "gap-2 px-3"}`;
  const rowStyle = subgridStyle ?? SUBGRID_STYLE;

  function cellStyle(index: number): React.CSSProperties | undefined {
    if (!isPinned || !stickyMeta) return undefined;
    const meta = stickyMeta[index];
    const padding = cellPaddingForSticky(index, columns.length);
    if (meta) {
      return { position: "sticky", left: meta.left, zIndex: meta.zIndex, backgroundColor: "var(--cell-bg)", ...padding };
    }
    return { position: "sticky", zIndex: 20, backgroundColor: "var(--cell-bg)", ...padding };
  }

  const innerCells = row.cells.map((cell, index) => {
    const align = columns[index]?.align;
    const justifyClass =
      align === "center" ? "flex items-center justify-center min-w-0" :
      align === "right"  ? "flex items-center justify-end min-w-0" :
                           "flex items-center min-w-0";
    return (
      <div key={index} className={justifyClass} style={cellStyle(index)}>
        {cell}
      </div>
    );
  });

  const mainRow = row.href ? (
    <Link href={row.href} className={rowClassName} style={rowStyle}>
      {innerCells}
    </Link>
  ) : (
    <div
      className={`${rowClassName} ${row.onMouseDown ? "cursor-pointer select-none" : ""}`}
      style={rowStyle}
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
