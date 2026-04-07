#!/usr/bin/env bash
# Tear down Docker Postgres (named volume survives `rm -rf` on the repo) and local
# gitignored artifacts. Does NOT delete .env — remove that yourself if you want
# a full secrets reset.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
cd "${repo_root}"

echo "==> Stopping Compose services and removing Postgres volume (badgehunters_pg)"
if docker compose version &>/dev/null; then
  docker compose down -v --remove-orphans
else
  echo "docker compose not found; skipping Docker teardown." >&2
fi

echo "==> Removing node_modules and .next (reinstall / rebuild after)"
rm -rf node_modules .next

echo "==> Nuke complete."
echo "    Next: docker compose up -d && npm install && npx prisma migrate deploy (or db push)"
