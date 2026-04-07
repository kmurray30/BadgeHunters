import { PrismaClient } from "@prisma/client";
import { parse } from "csv-parse/sync";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

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

    const existing = await prisma.badge.findUnique({
      where: { badgeNumber },
    });

    if (existing) {
      await prisma.badge.update({
        where: { badgeNumber },
        data: {
          name: record.Name,
          description: record.Description,
        },
      });
      updated++;
    } else {
      await prisma.badge.create({
        data: {
          badgeNumber,
          name: record.Name,
          description: record.Description,
          rooms: [],
          games: [],
          playerCountBucket: "none",
          tags: [],
          defaultDifficulty: "unknown",
          durationLabel: null,
          isPerVisit: false,
          isMetaBadge: false,
          active: true,
        },
      });
      created++;
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
