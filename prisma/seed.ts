import { PrismaClient, Difficulty, PlayerCountBucket } from "@prisma/client";
import { parse } from "csv-parse/sync";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

/**
 * Inferred badge metadata from description analysis.
 * The CSV only has Number/Name/Description — everything else is best-effort inference.
 */
interface InferredBadgeData {
  games: string[];
  rooms: string[];
  tags: string[];
  defaultDifficulty: Difficulty;
  playerCountBucket: PlayerCountBucket;
  isPerVisit: boolean;
  isMetaBadge: boolean;
}

// Known game names that appear in badge descriptions
const KNOWN_GAMES = [
  "15 Green", "Numbers", "Words", "Zap", "Barrage", "Bop", "Mines",
  "Mega Grid", "Grid", "Gems", "Bullet Train", "Flip", "Sequence",
  "Link", "Zones", "Mega Zones", "Jigsaw", "Tails", "Terminal",
  "Dartmouth", "Defuse", "Order Up", "Maze", "Wormholes", "Gauntlet",
  "Asteroids", "Relay", "Mega Relay", "Laser Relay", "Labyrinth",
  "Spellinator", "Trivial", "Stopwatch", "Statues",
];

function inferBadgeData(badgeNumber: number, name: string, description: string): InferredBadgeData {
  const descLower = description.toLowerCase();
  const nameLower = name.toLowerCase();

  // --- Infer games from description ---
  const games: string[] = [];
  for (const game of KNOWN_GAMES) {
    if (description.includes(game) || description.includes(game.toLowerCase())) {
      games.push(game);
    }
  }

  // Tags are not in the CSV — only set via admin tools
  const tags: string[] = [];

  // --- Infer player count bucket ---
  let playerCountBucket: PlayerCountBucket = "none";
  if (badgeNumber === 18) playerCountBucket = "gte_5"; // CHASING RAINBOWS: 5 players different colors
  if (badgeNumber === 77) playerCountBucket = "gte_5"; // SNAKE ISLAND: five players
  if (badgeNumber === 60) playerCountBucket = "lte_3"; // ONE BY ONE: 3 players
  if (descLower.includes("5 players") || descLower.includes("five players")) playerCountBucket = "gte_5";
  if (descLower.includes("3 players") || descLower.includes("three players")) playerCountBucket = "lte_3";

  // --- Infer per-visit ---
  const isPerVisit =
    descLower.includes("for one visit") ||
    descLower.includes("for an entire visit") ||
    descLower.includes("for a visit") ||
    descLower.includes("in one visit") ||
    // Specific per-visit badges by number:
    [16, 52, 58, 61, 74, 102].includes(badgeNumber);

  // --- Infer meta badge ---
  // Meta badges are time-sensitive, context-sensitive, or require specific party composition
  const isMetaBadge = [
    18, // CHASING RAINBOWS (5 distinct rank colors)
    20, // DAILY HIGH SCORER (after 9pm)
    34, // EARLY BIRD (before 11 AM)
    53, // MONTHLY HIGH SCORER (last day of month)
    55, // NIGHT OWL (after 11 PM)
  ].includes(badgeNumber);

  // --- Infer difficulty ---
  let defaultDifficulty: Difficulty = "unknown";

  // Streak badges: difficulty scales with the streak length
  const forMatch = nameLower.match(/^(\d+) for \1$/);
  if (forMatch) {
    const streakLength = parseInt(forMatch[1], 10);
    if (streakLength <= 3) defaultDifficulty = "easy";
    else if (streakLength <= 6) defaultDifficulty = "medium";
    else if (streakLength <= 9) defaultDifficulty = "hard";
    else defaultDifficulty = "impossible";
  }

  // Deja Vu series: scales by level
  if (nameLower.includes("déjà vu") || nameLower.includes("deja vu")) {
    if (nameLower.includes("master") || nameLower.includes("10")) defaultDifficulty = "hard";
    else if (descLower.includes("level 1") || descLower.includes("level 2") || descLower.includes("level 3")) defaultDifficulty = "easy";
    else if (descLower.includes("level 7") || descLower.includes("level 8") || descLower.includes("level 9")) defaultDifficulty = "hard";
    else defaultDifficulty = "medium";
  }

  // Untouchable series: scales by level
  if (nameLower.includes("untouchable")) {
    if (descLower.includes("level 1") || descLower.includes("level 2")) defaultDifficulty = "easy";
    else if (descLower.includes("level 3") || descLower.includes("level 4") || descLower.includes("level 5")) defaultDifficulty = "medium";
    else if (descLower.includes("level 6") || descLower.includes("level 7")) defaultDifficulty = "hard";
    else defaultDifficulty = "impossible";
  }

  // Easter eggs and riddles tend to be easy/medium once you know the trick
  if (nameLower.includes("easter egg")) defaultDifficulty = "medium";
  if (nameLower.includes("riddle")) defaultDifficulty = "medium";

  // Specific known-difficulty badges
  const specificDifficulties: Record<number, Difficulty> = {
    1: "impossible",   // 10 FOR 10: ten level 10 games in a row
    2: "hard",         // 15S IN 15S: exact timing
    13: "hard",        // ACTIV8: exact score 8888
    14: "impossible",  // ACTIVATED: beat ALL game levels
    15: "impossible",  // ADRENALINE JUNKIE
    17: "medium",      // CALL JENNY: 867-5309 score
    18: "hard",        // CHASING RAINBOWS: 5 different rank colors
    19: "hard",        // COMPLETIONIST: play every game
    20: "hard",        // DAILY HIGH SCORER: 3 high scores after 9pm
    34: "easy",        // EARLY BIRD: just play before 11am
    44: "medium",      // EXPANDING HORIZONS: play with 10 people
    47: "easy",        // FRIENDLY ENEMIES: 25 competitive games
    48: "medium",      // GO FOR GOLD: qualify for tournament
    49: "hard",        // HALFWAY MARK: beat half all levels
    51: "medium",      // HEATING UP: 50 competitive wins
    54: "medium",      // MY OWN COMPETITION: beat PB in 25 levels
    55: "easy",        // NIGHT OWL: play after 11pm
    58: "impossible",  // OMNIPOTENCE: only level 10s for a visit
    63: "easy",        // PHOTOBOMB: take a photo
    66: "hard",        // PRACTICE MAKES PERFECT: beat PB in 100 levels
    77: "hard",        // SNAKE ISLAND: 5 players alive 60s in Tails
    80: "hard",        // SOCIAL BUTTERFLY: play with 25 people
    81: "easy",        // STARTING A RIVALRY: 25 competitive wins
    82: "impossible",  // THE GAUNTLET: levels 1-10 in a row no loss
    83: "impossible",  // THE GAUNTLET PLUS: even harder
    84: "hard",        // THE GRAND TOUR: every room in a row no loss
    86: "hard",        // THE ULTIMATE WINNER: 100 competitive wins
    87: "hard",        // THUMB WAR: exact score 1234
    101: "easy",       // UP TO DATE: sign up for newsletter
    102: "medium",     // WIN/LOSS: 2:1 win ratio for a visit
  };

  if (specificDifficulties[badgeNumber] !== undefined) {
    defaultDifficulty = specificDifficulties[badgeNumber];
  }

  return {
    games,
    rooms: [],
    tags: [...new Set(tags)],
    defaultDifficulty,
    playerCountBucket,
    isPerVisit,
    isMetaBadge,
  };
}

async function main() {
  console.log("Seeding badges from badges.csv...");

  const csvPath = path.join(__dirname, "..", "badges.csv");
  let csvContent = fs.readFileSync(csvPath, "utf-8");

  // Strip BOM if present and normalize line endings
  if (csvContent.charCodeAt(0) === 0xfeff) {
    csvContent = csvContent.slice(1);
  }
  csvContent = csvContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const records: { Number: string; Name: string; Description: string }[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  });

  console.log(`Found ${records.length} badges in CSV.`);

  let created = 0;
  let updated = 0;

  for (const record of records) {
    const badgeNumber = parseInt(record.Number, 10);
    if (isNaN(badgeNumber)) {
      console.warn(`Skipping row with invalid badge number: ${record.Number}`);
      continue;
    }

    const inferred = inferBadgeData(badgeNumber, record.Name, record.Description);

    const badgeData = {
      name: record.Name,
      description: record.Description,
      games: inferred.games,
      rooms: inferred.rooms,
      tags: inferred.tags,
      defaultDifficulty: inferred.defaultDifficulty,
      playerCountBucket: inferred.playerCountBucket,
      isPerVisit: inferred.isPerVisit,
      isMetaBadge: inferred.isMetaBadge,
      durationLabel: null as string | null,
      active: true,
    };

    const existing = await prisma.badge.findUnique({
      where: { badgeNumber },
    });

    if (existing) {
      await prisma.badge.update({
        where: { badgeNumber },
        data: badgeData,
      });
      updated++;
    } else {
      await prisma.badge.create({
        data: { badgeNumber, ...badgeData },
      });
      created++;
    }
  }

  // --- Seed meta rules for meta badges ---
  console.log("Seeding meta rules...");

  const metaBadges = [
    {
      badgeNumber: 18, // CHASING RAINBOWS
      rules: [{ ruleType: "unique_rank_colors", rulePayloadJson: { min_distinct_colors: 5 } }],
    },
    {
      badgeNumber: 20, // DAILY HIGH SCORER
      rules: [{ ruleType: "time_window", rulePayloadJson: { start: "21:00", end: "23:59" } }],
    },
    {
      badgeNumber: 34, // EARLY BIRD
      rules: [{ ruleType: "time_window", rulePayloadJson: { start: "00:00", end: "11:00" } }],
    },
    {
      badgeNumber: 53, // MONTHLY HIGH SCORER
      rules: [{ ruleType: "day_of_month", rulePayloadJson: { days: [28, 29, 30, 31], match: "last_day_only" } }],
    },
    {
      badgeNumber: 55, // NIGHT OWL
      rules: [{ ruleType: "time_window", rulePayloadJson: { start: "23:00", end: "23:59" } }],
    },
  ];

  for (const metaBadge of metaBadges) {
    const badge = await prisma.badge.findUnique({ where: { badgeNumber: metaBadge.badgeNumber } });
    if (!badge) continue;

    // Delete existing rules for this badge and re-create
    await prisma.badgeMetaRule.deleteMany({ where: { badgeId: badge.id } });

    for (const rule of metaBadge.rules) {
      await prisma.badgeMetaRule.create({
        data: {
          badgeId: badge.id,
          ruleType: rule.ruleType,
          rulePayloadJson: rule.rulePayloadJson,
          active: true,
        },
      });
    }
  }

  console.log(`Seed complete: ${created} created, ${updated} updated.`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
