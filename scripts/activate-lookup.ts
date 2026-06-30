#!/usr/bin/env npx tsx
/**
 * CLI tool to test the Activate lookup module.
 *
 * Usage:
 *   npx tsx scripts/activate-lookup.ts shumsby
 */

import { lookupActivatePlayer } from "../src/lib/activate-lookup";

async function main() {
  const searchTerm = process.argv[2];

  if (!searchTerm) {
    console.error("Usage: npx tsx scripts/activate-lookup.ts <player-name>");
    process.exit(1);
  }

  console.log(`Searching for "${searchTerm}" on playactivate.com...\n`);
  const startTime = Date.now();

  const result = await lookupActivatePlayer(searchTerm);
  const elapsed = Date.now() - startTime;

  if (result.found) {
    console.log("✅ FOUND\n");
    console.log(`  Username:     ${result.activateUsername}`);
    console.log(`  Score:        ${result.score?.toLocaleString() ?? "—"}`);
    console.log(`  Rank:         ${result.rank ?? "—"}`);
    console.log(`  Leaderboard:  ${result.leaderboardPosition ?? "—"}`);
    console.log(`  Levels Beat:  ${result.levelsBeat ?? "—"}`);
    console.log(`  Coins:        ${result.coins ?? "—"}`);
  } else {
    console.log("❌ NOT FOUND\n");
    if (result.error) {
      console.log(`  Error:        ${result.error}`);
    }
  }

  console.log(`\n  Took ${elapsed}ms`);
  process.exit(result.found ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
