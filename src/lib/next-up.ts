import { DIFFICULTY_SORT_KEY, type BadgeCardData } from "@/lib/badge-cards";
import { LEVEL_NUMBERS, levelKey, type LevelsData, type LevelsGame, type LevelsRoom } from "@/lib/levels-grid";

export interface LevelTarget {
  room: LevelsRoom;
  game: LevelsGame;
  level: number;
  key: string;
  needCount: number;
}

/**
 * Badges the most selected players still need, easiest first among ties.
 * Badges everyone selected has already done are left out.
 */
export function badgesMostNeeded(badges: BadgeCardData[], selectedIds: string[], limit: number) {
  return badges
    .map((badge) => {
      const done = new Set(badge.doneBy);
      return { badge, needCount: selectedIds.filter((id) => !done.has(id)).length };
    })
    .filter((entry) => entry.needCount > 0)
    .sort(
      (entryA, entryB) =>
        entryB.needCount - entryA.needCount ||
        DIFFICULTY_SORT_KEY[entryA.badge.difficulty] - DIFFICULTY_SORT_KEY[entryB.badge.difficulty] ||
        entryA.badge.name.localeCompare(entryB.badge.name),
    )
    .slice(0, limit);
}

/**
 * Levels the most selected players still need to beat, lowest level first
 * among ties (then floor order).
 */
export function levelsMostNeeded(data: LevelsData, selectedIds: string[], limit: number): LevelTarget[] {
  const targets: LevelTarget[] = [];
  for (const room of data.rooms) {
    for (const game of room.games) {
      for (const level of LEVEL_NUMBERS) {
        const key = levelKey(game.id, level);
        const needCount = selectedIds.filter((id) => !data.scoresByPlayer[id]?.[key]).length;
        if (needCount > 0) targets.push({ room, game, level, key, needCount });
      }
    }
  }
  // Array.prototype.sort is stable, so floor order breaks remaining ties.
  return targets.sort((targetA, targetB) => targetB.needCount - targetA.needCount || targetA.level - targetB.level).slice(0, limit);
}
