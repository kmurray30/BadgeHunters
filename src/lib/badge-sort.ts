import type { BadgeCardData } from "@/lib/badge-cards";

export type BadgeSortKey = "completion" | "difficulty" | "groupSize";
export type SortDirection = "asc" | "desc";

export interface BadgeSort {
  key: BadgeSortKey;
  direction: SortDirection;
}

const DIFFICULTY_RANK: Record<BadgeCardData["difficulty"], number | null> = {
  easy: 1,
  medium: 2,
  hard: 3,
  impossible: 4,
  unknown: null,
};

const GROUP_SIZE_RANK: Record<string, number | null> = { lte_3: 1, gte_5: 2 };

/**
 * Tap cycle for one sort button: off → ascending → descending → off. A newly
 * turned-on sort goes after the ones already on, so it breaks their ties.
 */
export function cycleSort(sorts: BadgeSort[], key: BadgeSortKey): BadgeSort[] {
  const current = sorts.find((sort) => sort.key === key);
  if (!current) return [...sorts, { key, direction: "asc" }];
  if (current.direction === "asc") return sorts.map((sort) => (sort.key === key ? { key, direction: "desc" } : sort));
  return sorts.filter((sort) => sort.key !== key);
}

/**
 * Apply the active sorts in order. Completion is how many selected players have
 * done the badge (ascending = fewest first). Badges with no difficulty or group
 * size yet go last either way; the incoming order (PlayActivate's) breaks ties.
 */
export function sortBadges(
  badges: BadgeCardData[],
  sorts: BadgeSort[],
  doneCount: (badge: BadgeCardData) => number,
): BadgeCardData[] {
  if (sorts.length === 0) return badges;
  const value = (badge: BadgeCardData, key: BadgeSortKey): number | null =>
    key === "completion" ? doneCount(badge) : key === "difficulty" ? DIFFICULTY_RANK[badge.difficulty] : (GROUP_SIZE_RANK[badge.playerCount] ?? null);

  return [...badges].sort((badgeA, badgeB) => {
    for (const { key, direction } of sorts) {
      const valueA = value(badgeA, key);
      const valueB = value(badgeB, key);
      if (valueA === valueB) continue;
      if (valueA === null) return 1;
      if (valueB === null) return -1;
      return direction === "asc" ? valueA - valueB : valueB - valueA;
    }
    return 0;
  });
}
