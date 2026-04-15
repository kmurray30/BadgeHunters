#!/usr/bin/env npx tsx
/**
 * Uploads difficulty and player-count votes from a CSV file on behalf of a given user.
 *
 * Usage:
 *   npx tsx scripts/upload-votes.ts --csv badges.csv --email user@example.com
 *
 * The CSV is expected to have (at minimum) these columns:
 *   Number     - badge number (integer)
 *   Difficulty - Easy / Medium / Hard / Impossible? (or blank/???)
 *   # ppl      - numeric player count hint (e.g. "5" means ≥5 players; ≤3 maps to lte_3)
 *
 * Only rows with a recognised Difficulty or # ppl value produce a vote record.
 * Existing BadgeUserStatus rows for the user are upserted — other fields (isCompleted,
 * isTodo, personalNotesSummary) are never touched.
 */

import { prisma } from "../src/lib/db";
import * as fs from "fs";
import * as path from "path";
import type { Difficulty, PlayerCountBucket } from "@prisma/client";

// ─── CSV parsing ─────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let charIndex = 0; charIndex < line.length; charIndex++) {
    const char = line[charIndex];
    if (char === '"') {
      if (insideQuotes && line[charIndex + 1] === '"') {
        // Escaped double-quote inside quoted field
        current += '"';
        charIndex++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCsv(filePath: string): Record<string, string>[] {
  const rawContent = fs.readFileSync(filePath, "utf-8");
  const lines = rawContent.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    for (let colIndex = 0; colIndex < headers.length; colIndex++) {
      row[headers[colIndex]] = values[colIndex] ?? "";
    }
    return row;
  });
}

// ─── Value mapping ────────────────────────────────────────────────────────────

function mapDifficulty(rawValue: string): Difficulty | null {
  const normalised = rawValue.trim().toLowerCase();
  if (normalised === "easy") return "easy";
  if (normalised === "medium") return "medium";
  if (normalised === "hard") return "hard";
  if (normalised === "impossible" || normalised === "impossible?") return "impossible";
  // blank or "???" — no vote
  return null;
}

function mapPlayerCount(rawValue: string): PlayerCountBucket | null {
  const trimmed = rawValue.trim();
  if (trimmed === "") return null;
  const playerCount = parseInt(trimmed, 10);
  if (isNaN(playerCount)) return null;
  if (playerCount >= 5) return "gte_5";
  if (playerCount > 0 && playerCount <= 3) return "lte_3";
  // Ambiguous counts (4) don't map to either bucket
  return null;
}

// ─── CLI arg parsing ──────────────────────────────────────────────────────────

function getArg(flagName: string): string | null {
  const flagIndex = process.argv.indexOf(flagName);
  if (flagIndex === -1 || flagIndex + 1 >= process.argv.length) return null;
  return process.argv[flagIndex + 1];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const csvArg = getArg("--csv");
  const emailArg = getArg("--email");

  if (!csvArg || !emailArg) {
    console.error("Usage: npx tsx scripts/upload-votes.ts --csv <path> --email <user-email>");
    process.exit(1);
  }

  const csvPath = path.resolve(process.cwd(), csvArg);
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  // Look up the user by email
  const targetUser = await prisma.user.findUnique({ where: { email: emailArg } });
  if (!targetUser) {
    console.error(`No user found with email: ${emailArg}`);
    process.exit(1);
  }
  console.log(`Uploading votes for user: ${targetUser.activatePlayerName ?? targetUser.realName ?? emailArg} (${targetUser.id})`);

  // Load all badges keyed by badge number for fast lookups
  const allBadges = await prisma.badge.findMany({
    where: { active: true },
    select: { id: true, badgeNumber: true, name: true },
  });
  const badgeByNumber = new Map(allBadges.map((badge) => [badge.badgeNumber, badge]));

  const rows = parseCsv(csvPath);
  let upsertedCount = 0;
  let skippedCount = 0;

  for (const row of rows) {
    const badgeNumber = parseInt(row["Number"] ?? "", 10);
    if (isNaN(badgeNumber)) {
      skippedCount++;
      continue;
    }

    const badge = badgeByNumber.get(badgeNumber);
    if (!badge) {
      console.warn(`  Badge #${badgeNumber} not found in DB — skipping`);
      skippedCount++;
      continue;
    }

    const personalDifficulty = mapDifficulty(row["Difficulty"] ?? "");
    const idealPlayerCountBucket = mapPlayerCount(row["# ppl"] ?? "");

    // Nothing to vote on for this row
    if (personalDifficulty === null && idealPlayerCountBucket === null) {
      skippedCount++;
      continue;
    }

    // Only write the vote fields — never overwrite completion/todo/notes
    const voteData: { personalDifficulty?: Difficulty; idealPlayerCountBucket?: PlayerCountBucket } = {};
    if (personalDifficulty !== null) voteData.personalDifficulty = personalDifficulty;
    if (idealPlayerCountBucket !== null) voteData.idealPlayerCountBucket = idealPlayerCountBucket;

    await prisma.badgeUserStatus.upsert({
      where: { userId_badgeId: { userId: targetUser.id, badgeId: badge.id } },
      create: {
        userId: targetUser.id,
        badgeId: badge.id,
        ...voteData,
      },
      update: voteData,
    });

    console.log(
      `  #${badgeNumber} ${badge.name}: difficulty=${personalDifficulty ?? "—"}, players=${idealPlayerCountBucket ?? "—"}`
    );
    upsertedCount++;
  }

  console.log(`\nDone. ${upsertedCount} votes uploaded, ${skippedCount} rows skipped.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
