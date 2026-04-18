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
 * Name: `minmax(6rem, max-content)` + `measureMax: true`. BadgeTable
 *   measures the widest Name cell across every row (in a hidden nowrap
 *   clone) and substitutes the resulting pixel value for the `max-content`
 *   keyword before it hits grid-template-columns. So every row gets the
 *   SAME Name track width at the SAME viewport size (cells align), AND
 *   the track still flexes between 6rem and the measured max as the
 *   viewport narrows/widens. Tooltip/info icon never overlaps because at
 *   max the track is wide enough for the widest name + icon on one line.
 * Description: `minmax(8rem, 1fr)`. Description is the flex track that
 *   absorbs all leftover container width once Name has reached its
 *   measured-pixel max. On wide viewports it extends to the screen edge;
 *   on narrow viewports it shrinks toward its 8rem floor.
 *
 * ── Tuning the minimums ──────────────────────────────────────────────────
 * Change the `6rem` / `8rem` values below to raise/lower the column
 * floors globally. Those are the ONLY spots — every table reads through
 * these factories.
 */

export function nameColumn(overrides?: Partial<ColumnHeader>): ColumnHeader {
  return {
    label: "Name",
    width: "minmax(8rem, max-content)",
    sortField: "name",
    sticky: true,
    measureMax: true,
    ...overrides,
  };
}

export function descriptionColumn(overrides?: Partial<ColumnHeader>): ColumnHeader {
  return {
    label: "Description",
    width: "minmax(10rem, 1fr)",
    ...overrides,
  };
}
