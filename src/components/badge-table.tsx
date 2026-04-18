"use client";

import Link from "next/link";
import React, { useLayoutEffect, useRef, useState } from "react";
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
  /**
   * If true, a `1fr` "filler" track is injected into the grid immediately
   * after this column, and this column's cells (header + body) span both
   * tracks. The column's own track holds the intrinsic content-max size;
   * the filler absorbs any leftover container width so the cell visually
   * extends to the edge without the column's intrinsic width growing.
   */
  fillerAfter?: boolean;
  /**
   * If true, BadgeTable measures the widest cell in this column across
   * ALL rows (using a hidden max-content / nowrap clone) and replaces
   * the `max-content` keyword in `width` with that measured pixel value
   * before feeding it to grid-template-columns. This is the workaround
   * for the fact that every row is its own independent CSS grid (needed
   * so sticky cells stretch correctly): without it, `max-content` is
   * computed per-row and cells in the same column end up with different
   * widths. Use together with `width: "minmax(<min>, max-content)"` to
   * get a track that grows from <min> up to the widest cell's natural
   * width and STAYS ALIGNED across every row.
   */
  measureMax?: boolean;
  /**
   * Extra horizontal shift applied to the rotated label of a vertical
   * header (before rotation). Accepts any CSS length, e.g. "-9px".
   * Defaults to "-5px". Has no effect on non-vertical columns.
   */
  labelShift?: string;
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
// When pinning is active, each sticky cell gets position: sticky + left +
// z-index + an opaque background. To guarantee that the pinned area looks
// seamless even when sticky cells are narrower than their grid tracks or
// when there's a column-gap between them, the ROW itself is painted with
// the same --cell-bg color; the sticky cells simply layer on top of that
// continuous row background.
//
// Each sticky cell's `left` value is set to its *natural* x-position inside
// the row — the sum of the row's horizontal padding plus every preceding
// column's width plus the column-gap between tracks. Because `left` ==
// natural position, the cell never "slides" while transitioning into the
// pinned state; from the first pixel of horizontal scroll it's already
// clamped.

const ROW_PX = "0.5rem";       // matches px-2 on header & rows
const COLUMN_GAP = "0.5rem";   // matches gap-2 on header & rows

interface StickyMeta {
  left: string;
  zIndex: number;
}

/** Compute left offset and z-index for each sticky column.
 *
 * Left = ROW_PX + sum of each prior column's width + gap between each
 * prior pair of tracks. Using the column's natural x-position means
 * position:sticky clamps immediately at scroll > 0, with no slide-to-
 * pinned transition.
 *
 * Widths are passed in already-resolved (measureMax substitutions applied)
 * so the `calc()` expression only ever contains concrete length units.
 */
function buildStickyMeta(columns: ColumnHeader[], resolvedWidths: string[]): (StickyMeta | null)[] {
  const metas: (StickyMeta | null)[] = [];
  const parts: string[] = [ROW_PX];

  for (let index = 0; index < columns.length; index++) {
    if (columns[index].sticky) {
      const left = `calc(${parts.join(" + ")})`;
      metas.push({ left, zIndex: 30 });
    } else {
      metas.push(null);
    }
    parts.push(resolvedWidths[index]);
    if (index < columns.length - 1) {
      parts.push(COLUMN_GAP);
    }
  }
  return metas;
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

export function BadgeTable({ columns, rows, sections, emptyState, sortCriteria, onSortChange }: BadgeTableProps) {
  const hasPinnableColumns = columns.some((column) => column.sticky);
  const [pinned, setPinned] = usePersistedState("bh:table:pinColumns", false);
  const isPinned = hasPinnableColumns && pinned;

  // ── Measured max-content widths ──────────────────────────────────────────
  //
  // Each row renders as its own independent CSS grid (this is what makes
  // position:sticky cells behave correctly). The side-effect is that a
  // `max-content` track is computed PER ROW from that row's cells — so
  // rows end up with different Name/Description column widths and cells
  // visually misalign across rows.
  //
  // Fix: for columns flagged `measureMax: true`, we measure the widest
  // cell's natural (nowrapped, max-content) width across ALL rows once
  // after render, then substitute that fixed pixel value in for the
  // `max-content` keyword in `width`. Result: `minmax(6rem, max-content)`
  // becomes e.g. `minmax(6rem, 248px)`, a fully-concrete track value
  // that's identical for every row → cells align. The track still
  // grows/shrinks with the viewport because of the minmax range.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [measuredMaxes, setMeasuredMaxes] = useState<Record<number, number>>({});

  const resolvedWidths = columns.map((column, idx) => {
    const measured = measuredMaxes[idx];
    if (column.measureMax && measured != null) {
      return column.width.replace(/max-content/g, `${measured}px`);
    }
    return column.width;
  });

  // Sticky metadata (only computed when pinned). Widths stay at their
  // declared values — no inflation — so columns look identical in both modes.
  const stickyMeta = isPinned ? buildStickyMeta(columns, resolvedWidths) : null;
  const firstStickyIndex = stickyMeta ? stickyMeta.findIndex((m) => m !== null) : -1;

  // Inject a `1fr` filler track after any column marked `fillerAfter`. The
  // column's own track stays at its intrinsic size (e.g. minmax(min,
  // max-content)); the filler absorbs leftover container width so the
  // column's cell can span into it without forcing the intrinsic column
  // to grow. The filler is NOT a separate column in `columns` — cells
  // stay 1:1 with `columns`, and filler-owner cells get `grid-column:
  // span 2` so they visually cover both tracks.
  const gridTemplateColumns = columns
    .map((column, idx) => (column.fillerAfter ? `${resolvedWidths[idx]} 1fr` : resolvedWidths[idx]))
    .join(" ");

  // When a column has `fillerAfter`, its cell (header + body) spans two
  // grid tracks so the cell visually extends into the filler area.
  function cellSpanStyle(index: number): React.CSSProperties | undefined {
    return columns[index]?.fillerAfter ? { gridColumn: "span 2" } : undefined;
  }

  const alignClass = (align: ColumnHeader["align"]) =>
    align === "center" ? "text-center" : align === "right" ? "text-right" : undefined;

  function headerCellStyle(index: number): React.CSSProperties | undefined {
    const span = cellSpanStyle(index);
    if (!isPinned || !stickyMeta) return span;
    const meta = stickyMeta[index];
    if (!meta) return span;
    return {
      position: "sticky",
      left: meta.left,
      zIndex: meta.zIndex,
      backgroundColor: "var(--card)",
      // Paint box-shadows to cover the row's left padding (first sticky
      // only) and the gap-2 between adjacent sticky cells. Same-size
      // shadows offset horizontally; since the color matches the cell bg
      // they form a seamless opaque strip across the entire pinned area.
      boxShadow: buildStickyBoxShadow("var(--card)", index),
      ...span,
    };
  }

  function buildStickyBoxShadow(bg: string, index: number): string | undefined {
    if (!stickyMeta) return undefined;
    const isFirstSticky = index === firstStickyIndex;
    const nextIsSticky = (stickyMeta[index + 1] ?? null) !== null;
    const shadows: string[] = [];
    if (isFirstSticky) shadows.push(`-${ROW_PX} 0 0 0 ${bg}`);
    if (nextIsSticky) shadows.push(`${COLUMN_GAP} 0 0 0 ${bg}`);
    return shadows.length > 0 ? shadows.join(", ") : undefined;
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
      title={pinned ? "Unpin Name column" : "Pin Name column to the left"}
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

  // Each row is its own grid (not subgrid). This is the key change that
  // makes sticky columns behave correctly: position:sticky grid items
  // inside a subgrid don't reliably stretch to fill their tracks, which
  // caused "column width changes on lock" and transparent gutters around
  // sticky cells. Direct grid layout fixes both issues. Columns still
  // align across rows because every row uses the same gridTemplateColumns.
  const rowGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns,
    // min-content (not max-content) lets variable-max tracks actually
    // reach their minmax min on narrow containers; with max-content the
    // row would stay wide enough for every track's max-content and the
    // min regime would never trigger.
    minWidth: "min-content",
  };
  const rowStackingStyle: React.CSSProperties | undefined = isPinned
    ? { ...rowGridStyle, isolation: "isolate", zIndex: 0 }
    : rowGridStyle;

  // Stable digests so the measurement effect only re-runs when the set
  // of rows or the `measureMax` column flags actually changes.
  const rowKeyDigest = resolvedSections
    .flatMap((section) => section.rows.map((row) => row.key))
    .join("|");
  const measureMaxDigest = columns
    .map((column, idx) => (column.measureMax ? `${idx}:${column.width}` : ""))
    .filter(Boolean)
    .join(",");

  useLayoutEffect(() => {
    const root = wrapperRef.current;
    if (!root) return;
    const columnsToMeasure = columns
      .map((column, idx) => ({ column, idx }))
      .filter(({ column }) => column.measureMax);
    if (columnsToMeasure.length === 0) {
      setMeasuredMaxes((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }

    // Hidden measurement container appended INSIDE the table wrapper so
    // it inherits all ancestor font / text / Tailwind styles. Setting
    // width:max-content + white-space:nowrap makes each cloned cell
    // lay out at its true intrinsic width regardless of whatever track
    // size the real grid item is currently constrained to.
    const measurer = document.createElement("div");
    measurer.setAttribute("aria-hidden", "true");
    measurer.style.cssText =
      "position:absolute;visibility:hidden;pointer-events:none;top:-9999px;left:-9999px;width:max-content;white-space:nowrap;";
    root.appendChild(measurer);

    const next: Record<number, number> = {};
    try {
      for (const { idx: columnIndex } of columnsToMeasure) {
        const cells = root.querySelectorAll<HTMLElement>(
          `[data-bh-col-idx="${columnIndex}"][data-bh-cell-kind="body"]`,
        );
        let maxPixels = 0;
        cells.forEach((cell) => {
          const clone = cell.cloneNode(true) as HTMLElement;
          // Clear positioning / sizing styles that would reimpose a
          // track-width constraint on the clone.
          clone.style.position = "static";
          clone.style.width = "auto";
          clone.style.maxWidth = "none";
          clone.style.minWidth = "0";
          clone.style.boxShadow = "none";
          measurer.textContent = "";
          measurer.appendChild(clone);
          const measuredWidth = measurer.getBoundingClientRect().width;
          if (measuredWidth > maxPixels) maxPixels = measuredWidth;
        });
        if (maxPixels > 0) next[columnIndex] = Math.ceil(maxPixels);
      }
    } finally {
      root.removeChild(measurer);
    }

    setMeasuredMaxes((prev) => {
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (
        prevKeys.length === nextKeys.length &&
        nextKeys.every((key) => prev[Number(key)] === next[Number(key)])
      ) {
        return prev;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowKeyDigest, measureMaxDigest]);

  return (
    <div ref={wrapperRef} className="overflow-x-auto overflow-y-hidden rounded-lg border border-border">
      <div style={{ minWidth: "min-content" }}>
        {/* Column header row */}
        <div
          className="items-stretch gap-2 border-b border-border bg-card py-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted"
          style={rowStackingStyle}
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
                // Wrapper holds the sticky bg + positioning and fills the
                // track; the inner span inherits full track width via the
                // default grid-item justify-self: stretch, keeping the
                // rotated label aligned with the body column below.
                // Separating bg from rotation prevents the rotated
                // background rectangle from spilling into the neighbour.
                const labelShift = column.labelShift ?? "-5px";
                return (
                  <div
                    key={index}
                    className="min-w-0"
                    style={{
                      ...cellStyle,
                      display: "grid",
                      alignItems: "end",
                    }}
                  >
                    <span
                      title={column.tooltip ?? column.label}
                      className={`text-center normal-case tracking-normal text-[10px] leading-none ${column.bold ? "font-bold text-foreground" : ""}`}
                      style={{
                        writingMode: "vertical-rl",
                        transform: `rotate(195deg) translateX(${labelShift})`,
                        maxHeight: "3.5rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        textTransform: "none",
                      }}
                    >
                      {column.label}
                    </span>
                  </div>
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

              // Plain (non-sortable, non-vertical, non-pin-toggle) header:
              // wrap in a flex container with items-center so the label
              // stays vertically centered within the stretched header row.
              const flexJustify =
                column.align === "center" ? "justify-center" :
                column.align === "right" ? "justify-end" : "";
              return (
                <div key={index} className={`flex items-center min-w-0 ${flexJustify}`} style={cellStyle}>
                  <span title={column.tooltip} className={`${baseHeaderClass} ${alignClass(column.align) ?? ""}`}>
                    {column.label}
                  </span>
                </div>
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
                <div className="border-b border-border bg-card">
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
                    rowGridStyle={rowStackingStyle}
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

// ─── Row wrapper — direct-grid row (Link or div) ─────────────────────────────
//
// NOTE: rowGridStyle comes from the parent and contains the shared
// gridTemplateColumns plus the pin-mode stacking context (isolation:isolate).
// We intentionally use a direct grid per row (not subgrid) — this is what
// makes position:sticky cells stretch correctly and keeps column widths
// identical when toggling the lock button.

function RowWrapper({
  row,
  columns,
  isLastRow,
  stickyMeta,
  rowGridStyle,
  isPinned,
}: {
  row: BadgeTableRow;
  columns: ColumnHeader[];
  isLastRow: boolean;
  stickyMeta: (StickyMeta | null)[] | null;
  rowGridStyle: React.CSSProperties | undefined;
  isPinned: boolean;
}) {
  const needsBorder = row.footer || !isLastRow;
  const borderClass = needsBorder ? "border-b border-border" : "";
  const rowClassName = `items-stretch gap-2 py-2 transition-colors px-2 ${borderClass} ${row.className ?? "hover:bg-card-hover"}`;
  const rowStyle = rowGridStyle;

  const firstStickyIdx = stickyMeta ? stickyMeta.findIndex((meta) => meta !== null) : -1;

  function cellStyle(index: number): React.CSSProperties | undefined {
    // Columns marked `fillerAfter` get a sibling `1fr` track injected
    // into the grid; the cell must span both tracks to visually cover
    // the filler area.
    const span: React.CSSProperties | undefined = columns[index]?.fillerAfter
      ? { gridColumn: "span 2" }
      : undefined;

    if (!isPinned || !stickyMeta) return span;
    const meta = stickyMeta[index];
    if (!meta) return span;

    const isFirstSticky = index === firstStickyIdx;
    const nextIsSticky = (stickyMeta[index + 1] ?? null) !== null;
    const shadows: string[] = [];
    if (isFirstSticky) shadows.push(`-0.5rem 0 0 0 var(--cell-bg)`);
    if (nextIsSticky) shadows.push(`0.5rem 0 0 0 var(--cell-bg)`);

    return {
      position: "sticky",
      left: meta.left,
      zIndex: meta.zIndex,
      backgroundColor: "var(--cell-bg)",
      boxShadow: shadows.length > 0 ? shadows.join(", ") : undefined,
      ...span,
    };
  }

  const innerCells = row.cells.map((cell, index) => {
    const align = columns[index]?.align;
    const justifyClass =
      align === "center" ? "flex items-center justify-center min-w-0" :
      align === "right"  ? "flex items-center justify-end min-w-0" :
                           "flex items-center min-w-0";
    return (
      <div
        key={index}
        className={justifyClass}
        style={cellStyle(index)}
        data-bh-col-idx={index}
        data-bh-cell-kind="body"
      >
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
      <div className={footerBorderClass}>
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
