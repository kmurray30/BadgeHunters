-- AlterTable
ALTER TABLE "activate_games" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT false;

-- Games with a location leaderboard are the real ones; the hourly sync keeps this current.
UPDATE "activate_games" SET "is_active" = true
WHERE "room_slug" <> 'unknown'
  AND EXISTS (SELECT 1 FROM "global_level_top_scores" t WHERE t."game_id" = "activate_games"."id");
