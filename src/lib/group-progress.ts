/** "How many of the selected players have done it" buckets for filtering. */
export type GroupProgressFilter = "all" | "nobody" | "some" | "everyone";

export interface GroupFilterState {
  progress: GroupProgressFilter;
  notDoneByMe: boolean;
}

export const DEFAULT_GROUP_FILTERS: GroupFilterState = { progress: "all", notDoneByMe: false };

/**
 * Whether an item passes the group filters, given which selected players have
 * done it. "Some" means at least one but not all of the selected players.
 */
export function matchesGroupFilters(
  doneBy: (playerId: string) => boolean,
  selectedIds: string[],
  currentUserId: string,
  filters: GroupFilterState,
): boolean {
  if (filters.notDoneByMe && doneBy(currentUserId)) return false;

  const doneCount = selectedIds.filter(doneBy).length;
  switch (filters.progress) {
    case "nobody":
      return doneCount === 0;
    case "some":
      return doneCount > 0 && doneCount < selectedIds.length;
    case "everyone":
      return doneCount === selectedIds.length;
    default:
      return true;
  }
}

/** Plain-English summary of the active filters, or null when nothing is filtered. */
export function describeGroupFilters(filters: GroupFilterState, groupSize: number): string | null {
  const parts: string[] = [];
  if (groupSize > 1) {
    if (filters.progress === "nobody") parts.push("none of the selected players have done");
    if (filters.progress === "some") parts.push("some, but not all, of the selected players have done");
    if (filters.progress === "everyone") parts.push("every selected player has done");
    if (filters.notDoneByMe) parts.push("you haven't done");
  } else {
    if (filters.progress === "nobody") parts.push("you haven't done");
    if (filters.progress === "everyone") parts.push("you've done");
  }
  return parts.length > 0 ? `Only ones ${parts.join(" and ")}` : null;
}
