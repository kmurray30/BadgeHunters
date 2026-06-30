-- CreateEnum
CREATE TYPE "ScoreSyncStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "activate_games" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "room_slug" TEXT NOT NULL,
    "room_name" TEXT NOT NULL,
    "room_id" INTEGER NOT NULL,
    "sort_index" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activate_games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_level_scores" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "game_id" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_level_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_level_top_scores" (
    "id" TEXT NOT NULL,
    "game_id" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "top_score" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "global_level_top_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_sync_runs" (
    "id" TEXT NOT NULL,
    "status" "ScoreSyncStatus" NOT NULL DEFAULT 'pending',
    "started_by_user_id" TEXT NOT NULL,
    "total_steps" INTEGER NOT NULL DEFAULT 0,
    "completed_steps" INTEGER NOT NULL DEFAULT 0,
    "current_label" TEXT,
    "error_message" TEXT,
    "synced_count" INTEGER,
    "not_found_count" INTEGER,
    "error_count" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "score_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activate_games_room_slug_sort_index_idx" ON "activate_games"("room_slug", "sort_index");

-- CreateIndex
CREATE INDEX "user_level_scores_game_id_level_idx" ON "user_level_scores"("game_id", "level");

-- CreateIndex
CREATE UNIQUE INDEX "user_level_scores_user_id_game_id_level_key" ON "user_level_scores"("user_id", "game_id", "level");

-- CreateIndex
CREATE UNIQUE INDEX "global_level_top_scores_game_id_level_key" ON "global_level_top_scores"("game_id", "level");

-- CreateIndex
CREATE INDEX "score_sync_runs_status_idx" ON "score_sync_runs"("status");

-- AddForeignKey
ALTER TABLE "user_level_scores" ADD CONSTRAINT "user_level_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_level_scores" ADD CONSTRAINT "user_level_scores_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "activate_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "global_level_top_scores" ADD CONSTRAINT "global_level_top_scores_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "activate_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_sync_runs" ADD CONSTRAINT "score_sync_runs_started_by_user_id_fkey" FOREIGN KEY ("started_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
