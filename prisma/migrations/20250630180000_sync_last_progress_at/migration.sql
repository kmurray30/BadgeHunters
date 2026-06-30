-- Track last sync progress heartbeat for stall detection
ALTER TABLE "score_sync_runs" ADD COLUMN "last_progress_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
