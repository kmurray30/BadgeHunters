-- Sessions and their notifications were removed from the app.
-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_completed_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "session_members" DROP CONSTRAINT "session_members_session_id_fkey";

-- DropForeignKey
ALTER TABLE "session_members" DROP CONSTRAINT "session_members_user_id_fkey";

-- DropForeignKey
ALTER TABLE "session_ghost_members" DROP CONSTRAINT "session_ghost_members_session_id_fkey";

-- DropForeignKey
ALTER TABLE "session_badge_selections" DROP CONSTRAINT "session_badge_selections_session_id_fkey";

-- DropForeignKey
ALTER TABLE "session_badge_selections" DROP CONSTRAINT "session_badge_selections_badge_id_fkey";

-- DropForeignKey
ALTER TABLE "session_badge_selections" DROP CONSTRAINT "session_badge_selections_selected_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "session_badge_completions" DROP CONSTRAINT "session_badge_completions_session_id_fkey";

-- DropForeignKey
ALTER TABLE "session_badge_completions" DROP CONSTRAINT "session_badge_completions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "session_badge_completions" DROP CONSTRAINT "session_badge_completions_badge_id_fkey";

-- DropForeignKey
ALTER TABLE "session_user_acknowledgements" DROP CONSTRAINT "session_user_acknowledgements_session_id_fkey";

-- DropForeignKey
ALTER TABLE "session_user_acknowledgements" DROP CONSTRAINT "session_user_acknowledgements_user_id_fkey";

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_user_id_fkey";

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_session_id_fkey";

-- DropTable
DROP TABLE "sessions";

-- DropTable
DROP TABLE "session_members";

-- DropTable
DROP TABLE "session_ghost_members";

-- DropTable
DROP TABLE "session_badge_selections";

-- DropTable
DROP TABLE "session_badge_completions";

-- DropTable
DROP TABLE "session_user_acknowledgements";

-- DropTable
DROP TABLE "notifications";

-- DropEnum
DROP TYPE "SessionStatus";

-- DropEnum
DROP TYPE "NotificationType";

