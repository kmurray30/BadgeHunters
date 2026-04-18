/**
 * One-time migration:
 * 1. Delete PHOTOBOMB badge (badgeNumber 63)
 * 2. Decrement badgeNumber for all badges with badgeNumber >= 64
 * 3. Rename RIDDLE 5.0 → RIDDLE 6.0 (badgeNumber 70 after decrement)
 * 4. Rename RIDDLE 6.0 → RIDDLE 7.0 (badgeNumber 71 after decrement)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting badge migration...");

  // 1. Delete PHOTOBOMB (badgeNumber 63)
  const photobomb = await prisma.badge.findUnique({ where: { badgeNumber: 63 } });
  if (photobomb) {
    console.log(`Deleting PHOTOBOMB (id: ${photobomb.id}, number: 63)...`);
    await prisma.badge.delete({ where: { badgeNumber: 63 } });
    console.log("Deleted PHOTOBOMB.");
  } else {
    console.log("PHOTOBOMB badge not found — skipping deletion.");
  }

  // 2. Decrement badgeNumber for all badges >= 64 using a two-step rename
  //    to avoid per-row unique constraint conflicts in Postgres.
  await prisma.$executeRaw`
    UPDATE "badges" SET "badge_number" = "badge_number" + 1000 WHERE "badge_number" >= 64
  `;
  const renumberResult = await prisma.$executeRaw`
    UPDATE "badges" SET "badge_number" = "badge_number" - 1001 WHERE "badge_number" >= 1064
  `;
  console.log(`Renumbered ${renumberResult} badges (64+ → 63+).`);

  // 3. Rename riddles (after renumber: old 71 → 70, old 72 → 71)
  const riddle6Candidate = await prisma.badge.findUnique({ where: { badgeNumber: 70 } });
  if (riddle6Candidate) {
    console.log(`Renaming badge 70 ("${riddle6Candidate.name}") → RIDDLE 6.0`);
    await prisma.badge.update({
      where: { badgeNumber: 70 },
      data: { name: "RIDDLE 6.0" },
    });
  }

  const riddle7Candidate = await prisma.badge.findUnique({ where: { badgeNumber: 71 } });
  if (riddle7Candidate) {
    console.log(`Renaming badge 71 ("${riddle7Candidate.name}") → RIDDLE 7.0`);
    await prisma.badge.update({
      where: { badgeNumber: 71 },
      data: { name: "RIDDLE 7.0" },
    });
  }

  // Also seed the per-visit badge list adjustment:
  // The old badge number 102 → 101 for WIN/LOSS (per-visit)
  // The isPerVisit array in seed.ts references badge numbers — but since
  // those are computed at seed time, updating the CSV handles that going forward.

  console.log("Migration complete!");
}

main()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
