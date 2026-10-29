-- "Trivia" (1008) is hidden via HIDDEN_GAME_IDS; turn it off now rather than at the next sync.
UPDATE "activate_games" SET "is_active" = false WHERE "id" = 1008;
