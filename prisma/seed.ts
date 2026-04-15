import { PrismaClient } from "@prisma/client";
import { parse } from "csv-parse/sync";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

/**
 * Inferred badge metadata from description analysis.
 * Difficulty and player count are vote-only — not seeded here.
 */
interface InferredBadgeData {
  games: string[];
  rooms: string[];
  tags: string[];
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

function inferBadgeData(badgeNumber: number, description: string): InferredBadgeData {
  const descLower = description.toLowerCase();

  // --- Infer games from description ---
  const games: string[] = [];
  for (const game of KNOWN_GAMES) {
    if (description.includes(game) || description.includes(game.toLowerCase())) {
      games.push(game);
    }
  }

  // Tags are not in the CSV — only set via admin tools
  const tags: string[] = [];

  // --- Infer per-visit ---
  const isPerVisit =
    descLower.includes("for one visit") ||
    descLower.includes("for an entire visit") ||
    descLower.includes("for a visit") ||
    descLower.includes("in one visit") ||
    // Specific per-visit badges by number (from Tags column in badges.csv):
    [16, 18, 34, 52, 53, 55, 58, 61, 74, 102].includes(badgeNumber);

  // --- Infer meta badge ---
  // Meta badges are time-sensitive, context-sensitive, or require specific party composition
  const isMetaBadge = [
    18, // CHASING RAINBOWS (5 distinct rank colors)
    20, // DAILY HIGH SCORER (after 9pm)
    34, // EARLY BIRD (before 11 AM)
    53, // MONTHLY HIGH SCORER (last day of month)
    55, // NIGHT OWL (after 11 PM)
  ].includes(badgeNumber);

  return {
    games,
    rooms: [],
    tags: [...new Set(tags)],
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

    const inferred = inferBadgeData(badgeNumber, record.Description);

    const existing = await prisma.badge.findUnique({
      where: { badgeNumber },
    });

    if (existing) {
      // Update name/description from CSV plus per-visit/meta flags which are
      // inferred from stable badge numbers, not admin-curated.
      // Other fields (difficulty, player count, duration, etc.) are
      // admin-curated and should not be overwritten by the seed.
      await prisma.badge.update({
        where: { badgeNumber },
        data: {
          name: record.Name,
          description: record.Description,
          isPerVisit: inferred.isPerVisit,
          isMetaBadge: inferred.isMetaBadge,
          tags: [],
        },
      });
      updated++;
    } else {
      // New badge — set inferred defaults since there's nothing to preserve
      await prisma.badge.create({
        data: {
          badgeNumber,
          name: record.Name,
          description: record.Description,
          games: inferred.games,
          rooms: inferred.rooms,
          tags: [],
          isPerVisit: inferred.isPerVisit,
          isMetaBadge: inferred.isMetaBadge,
          active: true,
        },
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
