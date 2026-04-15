-- CreateEnum
CREATE TYPE "AuthType" AS ENUM ('google', 'test');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('user', 'superuser');

-- CreateEnum
CREATE TYPE "DisplayNameMode" AS ENUM ('player_name', 'real_name');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('unknown', 'easy', 'medium', 'hard', 'impossible');

-- CreateEnum
CREATE TYPE "PlayerCountBucket" AS ENUM ('none', 'lte_3', 'gte_5');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('active', 'completed_pending_ack', 'closed');

-- CreateEnum
CREATE TYPE "ScoreSource" AS ENUM ('scrape', 'manual', 'test_override');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('session_added', 'session_review');

-- CreateEnum
CREATE TYPE "ReactionType" AS ENUM ('thumbs_up', 'heart', 'laugh', 'fire', 'question');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('open', 'addressed', 'archived');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "auth_type" "AuthType" NOT NULL DEFAULT 'google',
    "role" "Role" NOT NULL DEFAULT 'user',
    "real_name" TEXT,
    "display_name_mode" "DisplayNameMode" NOT NULL DEFAULT 'player_name',
    "activate_player_name" TEXT,
    "google_account_name" TEXT,
    "image" TEXT,
    "current_score" INTEGER NOT NULL DEFAULT 0,
    "activate_rank" INTEGER,
    "leaderboard_position" TEXT,
    "levels_beat" TEXT,
    "coins" INTEGER,
    "rank_color" TEXT,
    "is_test_user" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_score_source" "ScoreSource",
    "last_synced_at" TIMESTAMP(3),
    "last_good_score_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "onboarding_complete" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badges" (
    "id" TEXT NOT NULL,
    "badge_number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rooms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "games" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_per_visit" BOOLEAN NOT NULL DEFAULT false,
    "is_meta_badge" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badge_user_status" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "badge_id" TEXT NOT NULL,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "is_todo" BOOLEAN NOT NULL DEFAULT false,
    "personal_difficulty" "Difficulty",
    "ideal_player_count_bucket" "PlayerCountBucket",
    "personal_notes_summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "badge_user_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badge_comments" (
    "id" TEXT NOT NULL,
    "badge_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "badge_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badge_comment_reactions" (
    "id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reaction_type" "ReactionType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "badge_comment_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badge_meta_rules" (
    "id" TEXT NOT NULL,
    "badge_id" TEXT NOT NULL,
    "rule_type" TEXT NOT NULL,
    "rule_payload_json" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "badge_meta_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "title" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'active',
    "session_date_local" DATE NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "completed_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_members" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "added_by_user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_ghost_members" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_ghost_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_badge_selections" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "badge_id" TEXT NOT NULL,
    "selected_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_badge_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_badge_completions" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "badge_id" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_badge_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_user_acknowledgements" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "acknowledged_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "needs_review" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_user_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "session_id" TEXT,
    "read_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_posts" (
    "id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'open',
    "edited_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_reactions" (
    "id" TEXT NOT NULL,
    "feedback_post_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reaction_type" "ReactionType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "badges_badge_number_key" ON "badges"("badge_number");

-- CreateIndex
CREATE UNIQUE INDEX "badge_user_status_user_id_badge_id_key" ON "badge_user_status"("user_id", "badge_id");

-- CreateIndex
CREATE UNIQUE INDEX "badge_comment_reactions_comment_id_user_id_reaction_type_key" ON "badge_comment_reactions"("comment_id", "user_id", "reaction_type");

-- CreateIndex
CREATE UNIQUE INDEX "session_members_session_id_user_id_key" ON "session_members"("session_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_badge_selections_session_id_badge_id_selected_by_us_key" ON "session_badge_selections"("session_id", "badge_id", "selected_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_badge_completions_session_id_user_id_badge_id_key" ON "session_badge_completions"("session_id", "user_id", "badge_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_user_acknowledgements_session_id_user_id_key" ON "session_user_acknowledgements"("session_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_reactions_feedback_post_id_user_id_reaction_type_key" ON "feedback_reactions"("feedback_post_id", "user_id", "reaction_type");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badge_user_status" ADD CONSTRAINT "badge_user_status_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badge_user_status" ADD CONSTRAINT "badge_user_status_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badge_comments" ADD CONSTRAINT "badge_comments_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badge_comments" ADD CONSTRAINT "badge_comments_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badge_comment_reactions" ADD CONSTRAINT "badge_comment_reactions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "badge_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badge_comment_reactions" ADD CONSTRAINT "badge_comment_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badge_meta_rules" ADD CONSTRAINT "badge_meta_rules_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_members" ADD CONSTRAINT "session_members_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_members" ADD CONSTRAINT "session_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_ghost_members" ADD CONSTRAINT "session_ghost_members_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_badge_selections" ADD CONSTRAINT "session_badge_selections_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_badge_selections" ADD CONSTRAINT "session_badge_selections_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_badge_selections" ADD CONSTRAINT "session_badge_selections_selected_by_user_id_fkey" FOREIGN KEY ("selected_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_badge_completions" ADD CONSTRAINT "session_badge_completions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_badge_completions" ADD CONSTRAINT "session_badge_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_badge_completions" ADD CONSTRAINT "session_badge_completions_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_user_acknowledgements" ADD CONSTRAINT "session_user_acknowledgements_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_user_acknowledgements" ADD CONSTRAINT "session_user_acknowledgements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_posts" ADD CONSTRAINT "feedback_posts_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_reactions" ADD CONSTRAINT "feedback_reactions_feedback_post_id_fkey" FOREIGN KEY ("feedback_post_id") REFERENCES "feedback_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_reactions" ADD CONSTRAINT "feedback_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

