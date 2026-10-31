#!/usr/bin/env bash
# Restore the database (and optionally the files) from a backup. Run on the shop server from deploy/:
#   ./scripts/restore.sh                      → lists the backups
#   ./scripts/restore.sh jeepcity-2026-11-01_0200.dump [files-2026-11-01_0200.tar.gz]
# A file from the cloud copy works too: put it in the backups volume first (README → "Restore from the cloud").
# A fresh backup of the current data is ALWAYS taken first, so a wrong restore can be undone.
set -euo pipefail
cd "$(dirname "$0")/.."
DC="docker compose"

if [ $# -lt 1 ]; then
  echo "Backups on this server:"; $DC exec -T backup ls -1t /backups | grep -E '\.(dump|tar\.gz)$' | head -30
  exit 0
fi
DUMP="$1"; FILES="${2:-}"
$DC exec -T backup test -f "/backups/$DUMP" || { echo "Not found: $DUMP"; exit 1; }

read -r -p "This REPLACES all current data with $DUMP. Type RESTORE to continue: " ok
[ "$ok" = "RESTORE" ] || { echo "Cancelled."; exit 1; }

echo "1/4 Safety backup of the current data…"
$DC exec -T backup backup.sh now
echo "2/4 Stopping the API (no writes during the restore)…"
$DC stop api
echo "3/4 Restoring the database…"
$DC exec -T backup sh -c "dropdb --if-exists --force jeepcity && createdb jeepcity && pg_restore --no-owner --dbname=jeepcity /backups/$DUMP"
if [ -n "$FILES" ]; then
  echo "    Restoring files from $FILES…"
  $DC run --rm --no-deps -v jeepcity_files:/data/files --entrypoint sh backup -c "rm -rf /data/files/* && tar -xzf /backups/$FILES -C /data"
fi
echo "4/4 Starting the API…"
$DC start api
sleep 5
curl -fsS http://127.0.0.1/api/health && echo && echo "Restore finished."
