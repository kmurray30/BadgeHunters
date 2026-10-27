import { LEVEL_NUMBERS, levelKey, type LevelsData, type LevelsGame, type LevelsRoom } from "@/lib/levels-grid";

export interface OpenLevel {
  level: number;
  key: string;
  /** How many of the selected players still have to beat it */
  needCount: number;
}

export interface GameTarget {
  room: LevelsRoom;
  game: LevelsGame;
  /** Levels at least one selected player hasn't beaten, lowest first */
  openLevels: OpenLevel[];
  /** Level beats still missing, summed over the selected players */
  needTotal: number;
  /** Open levels none of the selected players has beaten */
  neededByAll: number;
}

/**
 * Games where the selected players have the most levels left to beat between
 * them. Ties go to the game with more levels nobody selected has beaten, then
 * floor order. Games everyone has finished are left out.
 */
export function gamesMostNeeded(data: LevelsData, selectedIds: string[], limit: number): GameTarget[] {
  const targets: GameTarget[] = [];
  for (const room of data.rooms) {
    for (const game of room.games) {
      const openLevels: OpenLevel[] = [];
      for (const level of LEVEL_NUMBERS) {
        const key = levelKey(game.id, level);
        const needCount = selectedIds.filter((id) => !data.scoresByPlayer[id]?.[key]).length;
        if (needCount > 0) openLevels.push({ level, key, needCount });
      }
      if (openLevels.length === 0) continue;
      targets.push({
        room,
        game,
        openLevels,
        needTotal: openLevels.reduce((sum, open) => sum + open.needCount, 0),
        neededByAll: openLevels.filter((open) => open.needCount === selectedIds.length).length,
      });
    }
  }
  // Array.prototype.sort is stable, so floor order breaks remaining ties.
  return targets
    .sort((targetA, targetB) => targetB.needTotal - targetA.needTotal || targetB.neededByAll - targetA.neededByAll)
    .slice(0, limit);
}
