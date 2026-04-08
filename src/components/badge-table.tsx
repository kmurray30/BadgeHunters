import Link from "next/link";
import React from "react";

// ─── Column header ────────────────────────────────────────────────────────────

export interface ColumnHeader {
  label: string;
  /** Shown as a tooltip on the header cell */
  tooltip?: string;
  align?: "left" | "center";
  /** CSS grid track value, e.g. "minmax(0,2.5fr)", "5rem", "auto" */
  width: string;
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

// ─── Table ────────────────────────────────────────────────────────────────────

interface BadgeTableProps {
  columns: ColumnHeader[];
  rows: BadgeTableRow[];
  emptyState?: React.ReactNode;
}

export function BadgeTable({ columns, rows, emptyState }: BadgeTableProps) {
  const gridTemplateColumns = columns.map((column) => column.width).join(" ");

  const headerCells = columns.map((column, index) => (
    <span
      key={index}
      title={column.tooltip}
      className={column.align === "center" ? "text-center" : undefined}
    >
      {column.label}
    </span>
  ));

  return (
    <>
      {/* Header */}
      <div className="rounded-t-lg border border-border bg-card">
        <div
          className="grid items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted"
          style={{ gridTemplateColumns }}
        >
          {headerCells}
        </div>
      </div>

      {/* Body */}
      <div className="divide-y divide-border rounded-b-lg border-x border-b border-border">
        {rows.map((row) => (
          <RowWrapper key={row.key} row={row} gridTemplateColumns={gridTemplateColumns} />
        ))}
      </div>

      {/* Empty state */}
      {rows.length === 0 && emptyState}
    </>
  );
}

// ─── Row wrapper — Link or div depending on props ─────────────────────────────

function RowWrapper({
  row,
  gridTemplateColumns,
}: {
  row: BadgeTableRow;
  gridTemplateColumns: string;
}) {
  const rowClassName = `group grid items-center gap-2 px-3 py-2 transition-colors ${row.className ?? "hover:bg-card-hover"}`;

  const innerCells = (
    <>
      {row.cells.map((cell, index) => (
        <React.Fragment key={index}>{cell}</React.Fragment>
      ))}
    </>
  );

  const mainRow = row.href ? (
    <Link
      href={row.href}
      className={rowClassName}
      style={{ gridTemplateColumns }}
    >
      {innerCells}
    </Link>
  ) : (
    <div
      className={`${rowClassName} ${row.onMouseDown ? "cursor-pointer select-none" : ""}`}
      style={{ gridTemplateColumns }}
      onMouseDown={row.onMouseDown}
    >
      {innerCells}
    </div>
  );

  if (!row.footer) return mainRow;

  return (
    <div>
      {mainRow}
      {row.footer}
    </div>
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
}

export function BadgeCheckbox({
  checked,
  disabled,
  title,
  onClick,
  preventLinkNavigation,
}: BadgeCheckboxProps) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-6 w-6 items-center justify-center rounded border transition-colors ${
        checked
          ? "border-success bg-success/20 text-success hover:bg-success/30"
          : "border-border bg-background text-transparent hover:border-muted hover:text-muted"
      } ${disabled ? "cursor-not-allowed opacity-40 pointer-events-none" : ""}`}
    >
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={3}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
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
