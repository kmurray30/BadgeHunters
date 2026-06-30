import type { ColumnHeader } from "./badge-table";

/**
 * Shared factories for the "Name" and "Description" columns used by every
 * badge table (badges list, player badges, session Select Badges, session
 * Group Goals). Centralizes width and shared behavior so tweaking them
 * happens in ONE place instead of four.
 *
 * Pass `overrides` to customize per-table. To clear a defaulted field
 * (e.g. drop the name sort on the Group Goals table), pass it as
 * `undefined` — spread will overwrite the default.
 *
 * ── Sizing model ─────────────────────────────────────────────────────────
 * Both Name and Description are flex tracks (`1fr` / `3fr`), so as the
 * viewport widens BOTH columns grow at the same time (simultaneously) —
 * Description just grows 3× faster than Name since description text is
 * the longer of the two. Shrinking works in reverse: both shrink together,
 * with Name hitting its 8rem floor first (and forcing horizontal scroll)
 * once Description has shrunk to its 10rem floor.
 *
 * Because both are flex tracks, every row's grid computes the SAME track
 * width at a given container width (flex distribution is container-based,
 * not content-based), so cells naturally align across all rows with no
 * JS measurement needed.
 *
 * ── Tuning ───────────────────────────────────────────────────────────────
 * - Change `8rem` / `10rem` to raise/lower the column floors.
 * - Change the fr ratio (currently `1fr` vs `3fr`) to rebalance who
 *   absorbs more of the viewport slack as the window grows — e.g. bump
 *   Name to `2fr` to make Name grow faster, or flatten both to `1fr`
 *   to split slack 50/50.
 */

export function nameColumn(overrides?: Partial<ColumnHeader>): ColumnHeader {
  return {
    label: "Name",
    width: "minmax(8rem, 1fr)",
    sortField: "name",
    sticky: true,
    ...overrides,
  };
}

export function descriptionColumn(overrides?: Partial<ColumnHeader>): ColumnHeader {
  return {
    label: "Description",
    width: "minmax(10rem, 3fr)",
    ...overrides,
  };
}
