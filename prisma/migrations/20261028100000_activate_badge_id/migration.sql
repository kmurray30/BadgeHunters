-- AlterTable
ALTER TABLE "badges" ADD COLUMN "activate_badge_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "badges_activate_badge_id_key" ON "badges"("activate_badge_id");
